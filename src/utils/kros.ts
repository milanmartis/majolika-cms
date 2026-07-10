'use strict';

import crypto from 'crypto';
import { sendEmail } from './email';

type KrosDocumentItem = {
    amount: number;
    name: string;
    unitPrice: number;
    itemCode?: string;
    warehouseCode?: string;
  };
type Address = {
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
};

type OrderItem = {
    productId?: number;
    productName?: string;
    quantity: number;
    unitPrice: number;
    vatPercentage?: number;
    ean?: string | null;
    slug?: string | null;
    isDigitalProduct?: boolean;
    isGiftVoucher?: boolean;
    isGiftWrapProduct?: boolean;
  };

type OrderRecord = {
  id: number;

  // Číslo objednávky z invoice_counters, napr. 20260193
  invoiceNumber?: string | null;

  // Číslo dokladu/faktúry vrátené KROS-om
  krosInvoiceNumber?: string | null;
  krosInvoiceIssuedAt?: string | null;

  invoiceUrl?: string | null;

  krosRequestId?: string | null;
  krosStatus?: string | null;
  krosDocumentId?: string | null;
  sentToKrosAt?: string | null;

  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  orderLocale?: 'sk' | 'en' | 'de' | string | null;

  shippingAddress?: Address | null;

  billingIsCompany?: boolean | null;
  billingCompanyName?: string | null;
  billingIco?: string | null;
  billingDic?: string | null;
  billingIcDph?: string | null;
  billingAddress?: Address | null;

  paymentMethod?: 'card' | 'cod' | 'bank' | 'onsite' | 'post' | string | null;
  paymentStatus?: 'unpaid' | 'paid' | 'refunded' | string | null;

  deliveryMethod?: 'pickup' | 'post_office' | 'packeta_box' | 'post_courier' | 'digital_product' | string | null;
  deliveryUrgency?: 'standard' | 'rush' | string | null;

  notes?: string | null;
  total?: number | string | null;
  shippingFee?: number | string | null;
  paymentFee?: number | string | null;
  totalWithShipping?: number | string | null;

  items?: OrderItem[];

  // využijeme existujúce JSON polia na retry/queue meta
  krosLastPayload?: any;
  krosLastWebhook?: any;
};

function addDays(date: Date, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? Number(x.toFixed(2)) : 0;
}

function toUtf16LeBuffer(input: string): Buffer {
  return Buffer.from(input, 'utf16le');
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function invoiceLinkSecret(): string {
  const secret = process.env.INVOICE_LINK_SECRET || '';
  if (!secret) throw new Error('Missing INVOICE_LINK_SECRET');
  return secret;
}

export function createPublicInvoiceToken(
  orderId: number,
  documentId: string,
  expiresInSeconds = Number(process.env.INVOICE_LINK_TTL_SECONDS || 60 * 60 * 24 * 30)
): string {
  const payload = {
    orderId,
    documentId,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', invoiceLinkSecret())
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

export function verifyPublicInvoiceToken(token: string): { orderId: number; documentId: string } | null {
  try {
    const [encodedPayload, suppliedSignature] = String(token || '').split('.');
    if (!encodedPayload || !suppliedSignature) return null;

    const expectedSignature = crypto
      .createHmac('sha256', invoiceLinkSecret())
      .update(encodedPayload)
      .digest('base64url');

    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (!payload?.orderId || !payload?.documentId || !payload?.exp) return null;
    if (Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;

    return {
      orderId: Number(payload.orderId),
      documentId: String(payload.documentId),
    };
  } catch {
    return null;
  }
}

export function buildPublicInvoiceUrl(orderId: number, documentId: string): string {
  const publicApiUrl = String(process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
  if (!publicApiUrl) throw new Error('Missing PUBLIC_API_URL');

  const token = createPublicInvoiceToken(orderId, documentId);
  return `${publicApiUrl}/api/kros/invoices/${encodeURIComponent(token)}`;
}

export async function fetchInvoiceFromKros(documentId: string): Promise<Response> {
  const apiBase = String(process.env.KROS_API_BASE || '').replace(/\/$/, '');
  const token = process.env.KROS_API_TOKEN || '';
  const pathTemplate = process.env.KROS_INVOICE_PATH_TEMPLATE || '/api/invoices/{id}';

  if (!apiBase) throw new Error('Missing KROS_API_BASE');
  if (!token) throw new Error('Missing KROS_API_TOKEN');

  const path = pathTemplate.replace('{id}', encodeURIComponent(documentId));
  return fetch(`${apiBase}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/pdf, application/json;q=0.9, */*;q=0.8',
    },
  });
}

export function verifyKrosSignature(rawBody: string, signature?: string | string[] | null): boolean {
  const secret = process.env.KROS_WEBHOOK_SECRET || '';
  if (!secret || !signature || Array.isArray(signature)) return false;

  const digest = crypto
    .createHmac('sha256', toUtf16LeBuffer(secret))
    .update(toUtf16LeBuffer(rawBody))
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

function buildPartner(order: OrderRecord) {
    const useBilling = !!order.billingIsCompany;
    const addr = (useBilling ? order.billingAddress : order.shippingAddress) || {};
  
    const personName = order.customerName || '';
    const companyName = order.billingCompanyName || '';
    const displayName = useBilling
      ? (companyName || personName)
      : personName;
  
    return {
      address: {
        businessName: displayName,
        contactName: personName,
        street: addr.street || '',
        postCode: addr.zip || '',
        city: addr.city || '',
        country: addr.country || 'SK',
      },
      registrationId: useBilling ? (order.billingIco || '') : '',
      taxId: useBilling ? (order.billingDic || '') : '',
      vatId: useBilling ? (order.billingIcDph || '') : '',
      phoneNumber: order.customerPhone || '',
      email: order.customerEmail || '',
      postalAddress: {
        businessName: displayName,
        contactName: personName,
        street: addr.street || '',
        postCode: addr.zip || '',
        city: addr.city || '',
        country: addr.country || 'SK',
      },
    };
  }

/**
 * DOKUMENTOVANÉ názvy, o ktoré sa opierame:
 * - documentNumber
 * - variableSymbol
 * - items[].amount
 * - itemCode
 * - warehouseCode
 * - externalId
 *
 * Presný tvar requestu si doladíš podľa endpointu v Swaggeri.
 */
export function buildKrosPayload(order: OrderRecord) {
    const items = Array.isArray(order.items) ? order.items : [];
  
    const today = new Date().toISOString().slice(0, 10);

    const dueDate = addDays(new Date(), 14);
  
    const payloadItems = items.map((it) => {
        const qty = Number(it.quantity || 1);
        const unitPriceInclVat = n(it.unitPrice);
        const totalPriceInclVat = Number((qty * unitPriceInclVat).toFixed(2));
      
        return {
          name: it.productName || `Produkt #${it.productId || ''}`.trim(),
          description: '',
          amount: qty,
          measureUnit: 'ks',
          vatRate: Number(it.vatPercentage ?? 23),
          discountPercent: 0,
          totalPriceInclVat,
          discountName: '',
          itemCode: it.productId ? String(it.productId) : '',
          warehouseCode: '',
          eanCode: it.ean || '',
        };
      });
  
    if (n(order.shippingFee) > 0) {
      payloadItems.push({
        name: 'Doprava',
        description: '',
        amount: 1,
        measureUnit: 'ks',
        vatRate: 23,
        discountPercent: 0,
        totalPriceInclVat: n(order.shippingFee),
        discountName: '',
        itemCode: '',
        warehouseCode: '',
        eanCode: '',
      });
    }
  
    if (n(order.paymentFee) > 0) {
      payloadItems.push({
        name: 'Poplatok za dobierku',
        description: '',
        amount: 1,
        measureUnit: 'ks',
        vatRate: 23,
        discountPercent: 0,
        totalPriceInclVat: n(order.paymentFee),
        discountName: '',
        itemCode: '',
        warehouseCode: '',
        eanCode: '',
      });
    }
  
    return {
      data: {
        externalId: `eshop-order-${order.id}`,
  
        partner: buildPartner(order),
  
        items: payloadItems,
  
        internalNote: order.notes || '',
        printedNote: '',
        vatPayerType: 1,
        useParagraph7or7a: false,
        culture: 'sk-SK',
        openingText: '',
        closingText: '',
        registrationCourtText: '',
  
        dueDate: dueDate,
        currency: 'EUR',
        exchangeRate: 1,
  
        discountPercent: 0,
        discountTotalPriceInclVat: 0,
  
        tags: ['eshop'],
        issueDate: today,
        orderNumber: String(order.invoiceNumber || order.id),
  
        paymentType:
          order.paymentMethod === 'card'
            ? 'Kartou'
            : order.paymentMethod === 'cod'
              ? 'Dobierka'
              : order.paymentMethod === 'bank'
                ? 'Bankový prevod'
                : order.paymentMethod === 'onsite'
                  ? 'Hotovosť'
                  : order.paymentMethod === 'post'
                    ? 'Poštový poukaz'
                    : 'Bankový prevod',
  
        variableSymbol: String(order.id),
  
        bankAccount: {
            iban: process.env.KROS_BANK_IBAN || '',
            accountNumber: '',
            isForeign: false,
            swift: process.env.KROS_BANK_SWIFT || '',
        },
  
        deliveryDate: today,
        advancePaymentDeduction: 0,
  
        numberingSequence: 'OF',
        documentNumber: '',
        invoiceType: 0,
        creditedInvoiceNumber: '',
  
        mandatoryText: '',
        mandatoryTextType: 0,
        ossTaxState: 0,
  
        // customFields: [
        //   {
        //     label: 'Objednávka z e-shopu',
        //     value: String(order.invoiceNumber),
        //   },
        // ],
  
        accountingDetails: {
          syntheticAccount: '',
          analyticalAccount: '',
          descriptionAccounting: '',
        },
      },
    };
  }

function getRetryMeta(order: OrderRecord) {
  const meta = order.krosLastPayload?.retryMeta || {};
  return {
    attempts: Number(meta.attempts || 0),
    lastError: meta.lastError || null,
    nextAttemptAt: meta.nextAttemptAt || null,
  };
}

function computeNextAttemptIso(attempts: number): string {
  const base = Number(process.env.KROS_RETRY_BASE_SECONDS || 30);
  const seconds = Math.min(base * Math.pow(2, Math.max(0, attempts - 1)), 3600);
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function queueOrderToKros(orderId: number, reason: string) {
  await strapi.entityService.update('api::order.order', orderId, {
    data: {
      krosStatus: 'queued',
      krosLastPayload: {
        queueReason: reason,
        queuedAt: new Date().toISOString(),
        retryMeta: {
          attempts: 0,
          lastError: null,
          nextAttemptAt: new Date().toISOString(),
        },
      },
    } as any,
  });
}

export async function sendOrderToKros(orderId: number) {
  const apiBase = (process.env.KROS_API_BASE || '').replace(/\/$/, '');
  const token = process.env.KROS_API_TOKEN || '';
  const importPath = process.env.KROS_IMPORT_PATH || '';

  if (!apiBase) throw new Error('Missing KROS_API_BASE');
  if (!token) throw new Error('Missing KROS_API_TOKEN');
  if (!importPath) throw new Error('Missing KROS_IMPORT_PATH');

  const order = await strapi.entityService.findOne('api::order.order', orderId, {
    fields: [
      'id',
      'invoiceNumber',
      'krosInvoiceNumber',
      'krosInvoiceIssuedAt',
      'invoiceUrl',
      'krosRequestId',
      'krosStatus',
      'krosDocumentId',
      'sentToKrosAt',
      'customerName',
      'customerEmail',
      'customerPhone',
      'orderLocale',
      'shippingAddress',
      'billingIsCompany',
      'billingCompanyName',
      'billingIco',
      'billingDic',
      'billingIcDph',
      'paymentMethod',
      'paymentStatus',
      'deliveryMethod',
      'deliveryUrgency',
      'notes',
      'total',
      'shippingFee',
      'paymentFee',
      'totalWithShipping',
      'krosLastPayload',
    ] as any,
    populate: {
      items: true,
      billingAddress: true,
    },
  }) as unknown as OrderRecord | null;

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }
  
  if (order.krosDocumentId || order.krosInvoiceNumber) {
    return {
      skipped: true,
      reason: 'already_processed_in_kros',
      documentId: order.krosDocumentId || null,
      krosInvoiceNumber: order.krosInvoiceNumber || null,
    };
  }
  
  if (order.krosRequestId) {
    return {
      skipped: true,
      reason: 'already_sent',
      requestId: order.krosRequestId,
    };
  }

  const payload = buildKrosPayload(order);

  strapi.log.info(`[KROS][SEND] order #${orderId} payload=${JSON.stringify(payload)}`);
  strapi.log.info(`[KROS][SEND] endpoint=${apiBase}${importPath}`);

  const res = await fetch(`${apiBase}${importPath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`KROS send failed: HTTP ${res.status} ${text}`);
  }else{
    strapi.log.info(`[KROS][SEND] order #${orderId} response=${text}`);
  }

  const requestId = data?.requestId || null;

  await strapi.entityService.update('api::order.order', orderId, {
    data: {
      krosRequestId: requestId ? String(requestId) : null,
      krosStatus: 'accepted',
      sentToKrosAt: new Date().toISOString(),
      krosLastPayload: {
        payload,
        acceptedResponse: data,
        retryMeta: {
          attempts: getRetryMeta(order).attempts,
          lastError: null,
          nextAttemptAt: null,
        },
      },
    } as any,
  });


  strapi.log.info(`[KROS][SEND] order #${orderId} response=${text}`);
  return { ok: true, requestId, response: data };
}



export async function markKrosRetry(orderId: number, errorMessage: string) {
  const order = await strapi.entityService.findOne('api::order.order', orderId, {
    fields: ['id', 'krosLastPayload'] as any,
  }) as any;

  const current = getRetryMeta(order);
  const attempts = current.attempts + 1;
  const maxRetries = Number(process.env.KROS_MAX_RETRIES || 6);
  const nextAttemptAt = computeNextAttemptIso(attempts);

  const terminal = attempts >= maxRetries;

  await strapi.entityService.update('api::order.order', orderId, {
    data: {
      krosStatus: terminal ? 'failed' : 'retry_wait',
      krosLastPayload: {
        ...(order?.krosLastPayload || {}),
        retryMeta: {
          attempts,
          lastError: errorMessage,
          nextAttemptAt: terminal ? null : nextAttemptAt,
        },
      },
    } as any,
  });
}

export async function processQueuedKrosOrders(limit = 10) {
  const rows = await strapi.db.query('api::order.order').findMany({
    where: {
      $or: [
        { krosStatus: 'queued' },
        { krosStatus: 'retry_wait' },
      ],
    },
    select: ['id', 'krosStatus', 'krosLastPayload'],
    orderBy: { updatedAt: 'asc' } as any,
    limit,
  }) as any[];

  const now = new Date();

  const eligible = rows.filter((row) => {
    const nextAttemptAt = row?.krosLastPayload?.retryMeta?.nextAttemptAt;
    if (!nextAttemptAt) return true;
    return new Date(nextAttemptAt) <= now;
  });

  for (const row of eligible) {
    try {
      await strapi.entityService.update('api::order.order', row.id, {
        data: { krosStatus: 'sending' } as any,
      });

      await sendOrderToKros(row.id);
    } catch (e: any) {
      await markKrosRetry(row.id, e?.message || String(e));
      strapi.log.error(`[KROS][QUEUE] order #${row.id} failed: ${e?.message || e}`);
    }
  }

  return { scanned: rows.length, processed: eligible.length };
}

async function sendInvoiceReadyEmail(orderId: number, invoiceNumber: string, invoiceUrl?: string | null) {
    const order = await strapi.entityService.findOne('api::order.order', orderId, {
      fields: ['customerEmail', 'customerName', 'orderLocale'] as any,
    }) as any;
  
    if (!order?.customerEmail) return;
  
    const locale = String(order.orderLocale || 'sk').toLowerCase();
  
    const subject =
      locale.startsWith('en')
        ? `Invoice for order ${invoiceNumber}`
        : locale.startsWith('de')
          ? `Rechnung zur Bestellung ${invoiceNumber}`
          : `Faktúra k objednávke ${invoiceNumber}`;
  
    const hello =
      locale.startsWith('en')
        ? `Hello${order.customerName ? `, ${order.customerName}` : ''},`
        : locale.startsWith('de')
          ? `Guten Tag${order.customerName ? `, ${order.customerName}` : ''},`
          : `Dobrý deň${order.customerName ? `, ${order.customerName}` : ''},`;
  
    const intro =
      locale.startsWith('en')
        ? `Your invoice has been issued.`
        : locale.startsWith('de')
          ? `Ihre Rechnung wurde ausgestellt.`
          : `Vaša faktúra bola vystavená.`;
  
    const invoiceLabel =
      locale.startsWith('en')
        ? `Invoice number`
        : locale.startsWith('de')
          ? `Rechnungsnummer`
          : `Číslo faktúry`;
  
    const linkLabel =
      locale.startsWith('en')
        ? `View invoice`
        : locale.startsWith('de')
          ? `Rechnung zobraziť`
          : `Zobraziť faktúru`;
  
    await sendEmail({
      to: order.customerEmail,
      subject,
      html: `
        <p>${hello}</p>
        <p>${intro}</p>
        <p><strong>${invoiceLabel}:</strong> ${invoiceNumber}</p>
        ${invoiceUrl ? `<p><a href="${invoiceUrl}" target="_blank">${linkLabel}</a></p>` : ''}
      `,
    });
  }

export async function applyKrosWebhook(payload: any) {
  const requestId = payload?.requestId || null;
  const topStatus = payload?.status ?? null;

  const related = payload?.results?.relatedEntities?.[0] || null;
  const entity = payload?.results?.entities?.[0] || null;

  const documentId =
    related?.documentId ??
    entity?.data?.documentId ??
    entity?.data?.id ??
    null;

    const krosInvoiceNumber =
      related?.documentNumber ??
      entity?.data?.documentNumber ??
      null;

    const variableSymbol =
    related?.variableSymbol ??
    entity?.data?.variableSymbol ??
    null;

  const paymentStatus =
    related?.paymentStatus ?? null;


  let order: any = null;

  if (requestId) {
    order = await strapi.db.query('api::order.order').findOne({
      where: { krosRequestId: String(requestId) },
      select: [
        'id',
        'invoiceNumber',
        'krosInvoiceNumber',
      ],
    });
  }

  if (!order && variableSymbol) {
    const idCandidate = Number(variableSymbol);
    if (Number.isFinite(idCandidate)) {
      order = await strapi.db.query('api::order.order').findOne({
        where: { id: idCandidate },
        select: [
          'id',
          'invoiceNumber',
          'krosInvoiceNumber',
        ],
      });
    }
  }

  if (!order) {
    strapi.log.warn(`[KROS][WEBHOOK] unmatched requestId=${requestId} variableSymbol=${variableSymbol}`);
    return { matched: false };
  }
  const normalizedTopStatus = Number(topStatus);
  const updateData: any = {
    krosStatus: normalizedTopStatus === 200 ? 'processed' : 'processed_with_problems',
    krosLastWebhook: payload,
  };

  if (documentId) {
    updateData.krosDocumentId = String(documentId);
  }
  
  if (krosInvoiceNumber) {
    updateData.krosInvoiceNumber = String(krosInvoiceNumber);
  }
  let publicInvoiceUrl: string | null = null;
  if (documentId) {
    publicInvoiceUrl = buildPublicInvoiceUrl(order.id, String(documentId));
    updateData.invoiceUrl = publicInvoiceUrl;
  }
  if (krosInvoiceNumber) {
    updateData.krosInvoiceIssuedAt = new Date().toISOString();
  }

  // ak zapneš notifikácie o úhradách v KROS, paymentStatus príde vo webhooku
  if (paymentStatus === 3) {
    updateData.paymentStatus = 'paid';
  }

  await strapi.entityService.update('api::order.order', order.id, {
    data: updateData,
  });

  if (krosInvoiceNumber && !order.krosInvoiceNumber) {
    try {
      await sendInvoiceReadyEmail(
        order.id,
        String(krosInvoiceNumber),
        publicInvoiceUrl
      );
      strapi.log.info(`[KROS][EMAIL] invoice email sent for order #${order.id}`);
    } catch (e) {
      strapi.log.error(`[KROS][EMAIL] failed for order #${order.id}:`, e);
    }
  }

  return {
    matched: true,
    orderId: order.id,
    orderNumber: order.invoiceNumber || null,
    krosInvoiceNumber: krosInvoiceNumber || null,
  };
}