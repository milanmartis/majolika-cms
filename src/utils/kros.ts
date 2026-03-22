'use strict';

import crypto from 'crypto';

type KrosOrderItem = {
  productId?: number;
  productName?: string;
  quantity: number;
  unitPrice: number;
  ean?: string | null;
};

type KrosOrder = {
  id: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;

  notes?: string | null;
  total?: number | string;
  totalWithShipping?: number | string;
  shippingFee?: number | string;
  paymentFee?: number | string;

  paymentMethod?: string | null;
  paymentStatus?: string | null;
  deliveryMethod?: string | null;
  deliveryUrgency?: string | null;

  shippingAddress?: {
    street?: string;
    city?: string;
    zip?: string;
    country?: string;
  } | null;

  billingIsCompany?: boolean | null;
  billingCompanyName?: string | null;
  billingIco?: string | null;
  billingDic?: string | null;
  billingIcDph?: string | null;
  billingAddress?: {
    street?: string | null;
    city?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null;

  items?: KrosOrderItem[];
};

function toUtf16LeBuffer(input: string): Buffer {
  return Buffer.from(input, 'utf16le');
}

export function verifyKrosSignature(rawBody: string, signature?: string | string[] | null): boolean {
  const secret = process.env.KROS_WEBHOOK_SECRET || '';
  if (!secret) return false;
  if (!signature || Array.isArray(signature)) return false;

  const hash = crypto
    .createHmac('sha256', toUtf16LeBuffer(secret))
    .update(toUtf16LeBuffer(rawBody))
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

function money(n: number | string | null | undefined): number {
  const v = Number(n || 0);
  return Number.isFinite(v) ? Number(v.toFixed(2)) : 0;
}

function buildKrosPayload(order: KrosOrder) {
  const createAsDraft = String(process.env.KROS_CREATE_AS_DRAFT || 'true').toLowerCase() === 'true';

  const items = Array.isArray(order.items) ? order.items : [];

  const lineItems = items.map((it, idx) => ({
    lineNumber: idx + 1,
    text: it.productName || `Produkt #${it.productId || idx + 1}`,
    quantity: Number(it.quantity || 1),
    unitPrice: money(it.unitPrice),
    // ak Swagger KROS vyžaduje amount / price / unit / vatRate,
    // upravíš tieto názvy podľa presnej schémy
    ean: it.ean || null,
  }));

  const shippingFee = money(order.shippingFee);
  const paymentFee = money(order.paymentFee);

  if (shippingFee > 0) {
    lineItems.push({
      lineNumber: lineItems.length + 1,
      text: 'Doprava',
      quantity: 1,
      unitPrice: shippingFee,
      ean: null,
    });
  }

  if (paymentFee > 0) {
    lineItems.push({
      lineNumber: lineItems.length + 1,
      text: 'Dobierka / poplatok za platbu',
      quantity: 1,
      unitPrice: paymentFee,
      ean: null,
    });
  }

  const customerAddress = order.billingIsCompany
    ? (order.billingAddress || {})
    : (order.shippingAddress || {});

  const customerName = order.billingIsCompany
    ? (order.billingCompanyName || order.customerName || '')
    : (order.customerName || '');

  const documentNumberExternal = String(order.id);

  // Toto je univerzálna integračná schéma.
  // Názvy polí si prispôsob podľa Swaggeru KROS.
  return {
    documents: [
      {
        externalId: `eshop-order-${order.id}`,
        documentNumberExternal,
        draft: createAsDraft,

        documentType: 'invoice',
        issueDate: new Date().toISOString(),
        dueDate: new Date().toISOString(),

        customer: {
          name: customerName,
          email: order.customerEmail || null,
          phone: order.customerPhone || null,
          ico: order.billingIco || null,
          dic: order.billingDic || null,
          icDph: order.billingIcDph || null,
          address: {
            street: customerAddress?.street || null,
            city: customerAddress?.city || null,
            zip: customerAddress?.zip || null,
            country: customerAddress?.country || 'SK',
          },
        },

        note: order.notes || null,

        payment: {
          method: order.paymentMethod || null,
          status: order.paymentStatus || null,
        },

        delivery: {
          method: order.deliveryMethod || null,
          urgency: order.deliveryUrgency || null,
        },

        items: lineItems,
      },
    ],
  };
}

export async function sendOrderToKros(orderId: number) {
  const apiBase = process.env.KROS_API_BASE || 'https://api-economy.kros.sk/api';
  const token = process.env.KROS_API_TOKEN || '';
  const importPath = process.env.KROS_IMPORT_PATH || '';

  if (!token) {
    throw new Error('Missing KROS_API_TOKEN');
  }
  if (!importPath) {
    throw new Error('Missing KROS_IMPORT_PATH');
  }

  const order = await strapi.entityService.findOne('api::order.order', orderId, {
    fields: [
      'id',
      'customerName',
      'customerEmail',
      'customerPhone',
      'notes',
      'total',
      'totalWithShipping',
      'shippingFee',
      'paymentFee',
      'paymentMethod',
      'paymentStatus',
      'deliveryMethod',
      'deliveryUrgency',
      'billingIsCompany',
      'billingCompanyName',
      'billingIco',
      'billingDic',
      'billingIcDph',
      'krosRequestId',
      'invoiceNumber',
    ] as any,
    populate: {
      items: true,
      shippingAddress: true,
      billingAddress: true,
    },
  }) as any;

  if (!order) throw new Error(`Order ${orderId} not found`);

  if (order.invoiceNumber) {
    strapi.log.info(`[KROS] Order #${orderId} already has invoiceNumber, skipping`);
    return { skipped: true, reason: 'already_invoiced' };
  }

  if (order.krosRequestId) {
    strapi.log.info(`[KROS] Order #${orderId} already has krosRequestId=${order.krosRequestId}, skipping`);
    return { skipped: true, reason: 'already_sent' };
  }

  const payload = buildKrosPayload(order);

  const response = await fetch(`${apiBase}${importPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    strapi.log.error(`[KROS][SEND] HTTP ${response.status}: ${text}`);
    throw new Error(`KROS send failed: HTTP ${response.status}`);
  }

  const requestId = data?.requestId || null;

  await strapi.entityService.update('api::order.order', orderId, {
    data: {
      krosRequestId: requestId,
      krosStatus: 'accepted',
      sentToKrosAt: new Date().toISOString(),
      krosLastPayload: payload,
    } as any,
  });

  return {
    ok: true,
    requestId,
    response: data,
  };
}

export async function applyKrosWebhook(payload: any) {
  // Payload z webhooku závisí od KROS schémy.
  // Snažíme sa byť tolerantní.
  const requestId =
    payload?.requestId ||
    payload?.RequestId ||
    payload?.requestID ||
    null;

  const externalId =
    payload?.externalId ||
    payload?.document?.externalId ||
    null;

  const invoiceNumber =
    payload?.invoiceNumber ||
    payload?.documentNumber ||
    payload?.document?.documentNumber ||
    payload?.document?.number ||
    null;

  const documentId =
    payload?.documentId ||
    payload?.document?.id ||
    null;

  const invoiceUrl =
    payload?.invoiceUrl ||
    payload?.pdfUrl ||
    payload?.document?.pdfUrl ||
    null;

  const paid =
    payload?.paid ??
    payload?.isPaid ??
    payload?.document?.paid ??
    null;

  const webhookStatus =
    payload?.status ||
    payload?.documentStatus ||
    payload?.result ||
    'processed';

  let order: any = null;

  if (requestId) {
    order = await strapi.db.query('api::order.order').findOne({
      where: { krosRequestId: String(requestId) },
      select: ['id', 'paymentStatus'],
    });
  }

  if (!order && externalId && String(externalId).startsWith('eshop-order-')) {
    const orderId = Number(String(externalId).replace('eshop-order-', ''));
    if (Number.isFinite(orderId)) {
      order = await strapi.db.query('api::order.order').findOne({
        where: { id: orderId },
        select: ['id', 'paymentStatus'],
      });
    }
  }

  if (!order) {
    strapi.log.warn(`[KROS][WEBHOOK] Order not found for requestId=${requestId}, externalId=${externalId}`);
    return { matched: false };
  }

  const dataToUpdate: any = {
    krosStatus: webhookStatus,
    krosLastWebhook: payload,
  };

  if (documentId) dataToUpdate.krosDocumentId = String(documentId);
  if (invoiceNumber) dataToUpdate.invoiceNumber = String(invoiceNumber);
  if (invoiceUrl) dataToUpdate.invoiceUrl = String(invoiceUrl);

  if (paid === true) {
    dataToUpdate.paymentStatus = 'paid';
  }

  await strapi.entityService.update('api::order.order', order.id, {
    data: dataToUpdate,
  });

  return {
    matched: true,
    orderId: order.id,
    invoiceNumber: invoiceNumber || null,
  };
}