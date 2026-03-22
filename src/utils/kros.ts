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
  ean?: string | null;
  slug?: string | null;
  isDigitalProduct?: boolean;
  isGiftVoucher?: boolean;
  isGiftWrapProduct?: boolean;
};

type OrderRecord = {
  id: number;
  invoiceNumber?: string | null;
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

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? Number(x.toFixed(2)) : 0;
}

function toUtf16LeBuffer(input: string): Buffer {
  return Buffer.from(input, 'utf16le');
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

function buildCustomer(order: OrderRecord) {
  const useBilling = !!order.billingIsCompany;
  const addr = (useBilling ? order.billingAddress : order.shippingAddress) || {};

  return {
    name: useBilling
      ? (order.billingCompanyName || order.customerName || '')
      : (order.customerName || ''),
    email: order.customerEmail || null,
    phone: order.customerPhone || null,
    ico: order.billingIco || null,
    dic: order.billingDic || null,
    icDph: order.billingIcDph || null,
    address: {
      street: addr.street || null,
      city: addr.city || null,
      zip: addr.zip || null,
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
  
    const documentItems: KrosDocumentItem[] = items.map((it) => ({
      amount: Number(it.quantity || 1),
      name: it.productName || `Produkt #${it.productId || ''}`.trim(),
      unitPrice: n(it.unitPrice),
      itemCode: it.productId ? String(it.productId) : undefined,
      // warehouseCode: 'MAIN',
    }));
  
    if (n(order.shippingFee) > 0) {
      documentItems.push({
        amount: 1,
        name: 'Doprava',
        unitPrice: n(order.shippingFee),
      });
    }
  
    if (n(order.paymentFee) > 0) {
      documentItems.push({
        amount: 1,
        name: 'Poplatok za dobierku',
        unitPrice: n(order.paymentFee),
      });
    }
  
    return {
      documents: [
        {
          externalId: `eshop-order-${order.id}`,
          documentNumber: '',
          variableSymbol: String(order.id),
          orderNumber: String(order.id),
          note: order.notes || null,
          customer: buildCustomer(order),
          items: documentItems,
        },
      ],
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
      'invoiceUrl',
      'krosRequestId',
      'krosStatus',
      'krosDocumentId',
      'sentToKrosAt',
      'customerName',
      'customerEmail',
      'customerPhone',
      'orderLocale',
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
      shippingAddress: true,
      billingAddress: true,
    },
  }) as unknown as OrderRecord | null;

  if (!order) throw new Error(`Order ${orderId} not found`);
  if (order.invoiceNumber) return { skipped: true, reason: 'already_invoiced' };
  if (order.krosRequestId) return { skipped: true, reason: 'already_sent', requestId: order.krosRequestId };

  const payload = buildKrosPayload(order);

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

  await sendEmail({
    to: order.customerEmail,
    subject,
    html: `
      <p>Dobrý deň${order.customerName ? `, ${order.customerName}` : ''},</p>
      <p>Vaša faktúra bola vystavená.</p>
      <p>Číslo faktúry: <b>${invoiceNumber}</b></p>
      ${invoiceUrl ? `<p><a href="${invoiceUrl}" target="_blank">Zobraziť faktúru</a></p>` : ''}
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
    null;

  const invoiceNumber =
    related?.documentNumber ??
    null;

  const variableSymbol =
    related?.variableSymbol ??
    entity?.data?.variableSymbol ??
    null;

  const paymentStatus =
    related?.paymentStatus ?? null;

  const apiUrl = payload?.apiUrl || null;

  let order: any = null;

  if (requestId) {
    order = await strapi.db.query('api::order.order').findOne({
      where: { krosRequestId: String(requestId) },
      select: ['id', 'invoiceNumber'],
    });
  }

  if (!order && variableSymbol) {
    const idCandidate = Number(variableSymbol);
    if (Number.isFinite(idCandidate)) {
      order = await strapi.db.query('api::order.order').findOne({
        where: { id: idCandidate },
        select: ['id', 'invoiceNumber'],
      });
    }
  }

  if (!order) {
    strapi.log.warn(`[KROS][WEBHOOK] unmatched requestId=${requestId} variableSymbol=${variableSymbol}`);
    return { matched: false };
  }

  const updateData: any = {
    krosStatus: topStatus === 200 ? 'processed' : 'processed_with_problems',
    krosLastWebhook: payload,
  };

  if (documentId) updateData.krosDocumentId = String(documentId);
  if (invoiceNumber) updateData.invoiceNumber = String(invoiceNumber);
  if (apiUrl) updateData.invoiceUrl = String(apiUrl);
  if (invoiceNumber) updateData.invoiceIssuedAt = new Date().toISOString();

  // ak zapneš notifikácie o úhradách v KROS, paymentStatus príde vo webhooku
  if (paymentStatus === 3) {
    updateData.paymentStatus = 'paid';
  }

  await strapi.entityService.update('api::order.order', order.id, {
    data: updateData,
  });

  if (invoiceNumber && !order.invoiceNumber) {
    await sendInvoiceReadyEmail(order.id, String(invoiceNumber), apiUrl || null);
  }

  return {
    matched: true,
    orderId: order.id,
    invoiceNumber: invoiceNumber || null,
  };
}