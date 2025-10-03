// src/api/payment/controllers/payment.ts
import qs from 'qs';
import fetch from 'node-fetch';
import { sendEmail } from '../../../utils/email';

// ========================= Comgate ENV =========================
const API = process.env.COMGATE_API || 'https://payments.comgate.cz/v1.0';
const MERCHANT = process.env.COMGATE_MERCHANT!;
const SECRET = process.env.COMGATE_SECRET!;
const TEST = String(process.env.COMGATE_TEST || 'false').toLowerCase() === 'true';
// Ak je true, ber AUTHORIZED ako "paid" (v testoch sa často vracia AUTHORIZED)
const AUTH_AS_PAID = String(process.env.COMGATE_AUTHORIZED_AS_PAID || 'false').toLowerCase() === 'true';

// ========================= Typy =========================
type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

type EventInfo = {
  sessionId?: number;
  type?: 'workshop' | 'tour' | string;
  startDateTime?: string;   // ISO (UTC)
  peopleCount?: number;
  bookingId?: number;
};

type OrderItem = {
  productId: number;
  productName?: string;
  quantity: number;
  unitPrice: number;
  event?: EventInfo | null;
};

type DeliveryMethod = 'pickup' | 'post_office' | 'packeta_box' | 'post_courier';

type OrderRecord = {
  id: number;
  customerEmail?: string;
  customerName?: string;
  shippingFee?: number | string;
  total?: number | string;
  totalWithShipping?: number | string;
  deliveryMethod?: DeliveryMethod;
  deliveryAddress?: {
    street?: string;
    city?: string;
    zip?: string;
    country?: string;
  } | null;
  deliveryDetails?: {
    provider?: string;
    postOfficeId?: string;
    packetaBoxId?: string;
    notes?: string;
  } | null;
  temporaryId?: string | null;
  items?: OrderItem[];

  paymentStatus?: PaymentStatus | null;
  comgateTransId?: string | null;
};

// ========================= Helpery (bezpečnosť, render, logy) =========================

// bezpečný JSON do logu (bez PII)
function redact(obj: any) {
  try {
    const o = typeof obj === 'string' ? Object.fromEntries(new URLSearchParams(obj)) : { ...(obj || {}) };
    for (const k of ['email', 'fullName', 'customerEmail', 'customerName', 'phone']) {
      if (o[k] != null) o[k] = '[redacted]';
    }
    return JSON.stringify(o);
  } catch {
    return '[unserializable]';
  }
}

// základný stringify (keď redakcia netreba)
function safe(o: any) {
  try { return JSON.stringify(o); } catch { return String(o); }
}

// HTML escape (XSS ochrana v e-mailoch)
function esc(s?: string) {
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// Absolútna URL pre obrázky
function absUrl(url?: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base =
    process.env.PUBLIC_UPLOADS_URL ||
    process.env.FRONTEND_URL ||
    (strapi.config?.get?.('server.url') as string) ||
    '';
  return `${String(base).replace(/\/$/, '')}${url?.startsWith('/') ? '' : '/'}${url}`;
}

function pickProductImage(product: any): string {
  const single = product?.picture_new;
  const firstMulti = Array.isArray(product?.pictures_new) ? product.pictures_new[0] : null;
  const media = single || firstMulti || null;
  const url =
    media?.formats?.thumbnail?.url ||
    media?.formats?.small?.url ||
    media?.formats?.medium?.url ||
    media?.formats?.large?.url ||
    media?.url;
  return absUrl(url);
}

function money(n: number) {
  return `${n.toFixed(2)} €`;
}

function formatEventSk(event?: EventInfo): string {
  if (!event?.startDateTime) return '';
  const dt = new Date(event.startDateTime);
  const d = new Intl.DateTimeFormat('sk-SK', {
    timeZone: 'Europe/Bratislava',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dt);
  const t = new Intl.DateTimeFormat('sk-SK', {
    timeZone: 'Europe/Bratislava',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
  const ppl = typeof event.peopleCount === 'number' ? ` • Osoby: ${event.peopleCount}` : '';
  return `Termín: ${d}, ${t}${ppl}`;
}

function renderItemsRows(items: Array<{
  productName: string;
  unitPrice: number;
  quantity: number;
  image?: string;
  event?: EventInfo | null;
}>) {
  return items
    .map((it) => {
      const subtotal = it.unitPrice * it.quantity;
      const eventLine = it?.event?.startDateTime
        ? `<div style="font-size:13px;color:#0e29a0;padding:4px 4px 0 4px;">${esc(formatEventSk(it.event!))}</div>`
        : '';
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${it.image ? `<img src="${it.image}" alt="" width="64" height="64" style="object-fit:cover;border-radius:4px;" />` : '<img src="https://staging.d2y68xwoabt006.amplifyapp.com/assets/img/logo-SLM-modre.gif" alt="" width="64" height="64" style="object-fit:cover;border-radius:4px;" />'}
              <div>
                <div style="font-weight:600;color:#333;">${esc(it.productName)}</div>
                ${eventLine}
                <div style="font-size:13px;color:#777;">${money(it.unitPrice)} × ${it.quantity}</div>
              </div>
            </div>
          </td>
          <td align="right" style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;color:#333;">
            ${money(subtotal)}
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderOrderEmail(opts: {
  title: string;
  heading: string;
  introLines: string[];
  cta?: { label: string; href: string } | null;
  items: Array<{ productName: string; unitPrice: number; quantity: number; image?: string; event?: EventInfo | null }>;
  shippingFee: number;
  totalWithShipping: number;
  deliverySummary: string;
}) {
  const itemsRows = renderItemsRows(opts.items);
  return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <title>${esc(opts.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #fff url('https://staging.d2y68xwoabt006.amplifyapp.com/assets/img/corner6.png') no-repeat right bottom;
      background-size: 200px auto; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.05); overflow: hidden; }
    .header { background-color: #0e29a0; color: white; padding: 24px; text-align: center; }
    .content { padding: 32px; }
    .content h2 { margin-top: 0; color: #333; }
    .content p { font-size: 16px; line-height: 1.6; color: #444; }
    .button { display: inline-block; margin-top: 24px; padding: 12px 24px; background-color: #0e29a0; color: white !important; text-decoration: none; border-radius: 4px; font-weight: bold; transition: background-color 0.3s ease; }
    .button:hover { background-color: #0b1e7c; }
    .footer { background-color: #fafafa; color: #777; font-size: 13px; padding: 24px; text-align: center; line-height: 1.5; }
    .footer a { color: #0e29a0; text-decoration: none; }
    .footer-logo { margin-top: 16px; }
    .footer-logo img { max-width: 120px; opacity: 0.9; }
    @media (max-width: 620px) { .content { padding: 20px; } .header { padding: 18px; } }
    table { width:100%; border-collapse: collapse; }
    th { text-align:left; font-size:12px; color:#666; padding: 6px 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Vitajte v Majolike</h1></div>
    <div class="content">
      <h2>${esc(opts.heading)}</h2>
      ${opts.introLines.map((t) => `<p>${esc(t)}</p>`).join('')}
      ${opts.cta ? `<p style="text-align:center;"><a class="button" href="${opts.cta.href}">${esc(opts.cta.label)}</a></p>` : ''}

      <h3 style="color:#333;margin-top:32px;">Zhrnutie objednávky</h3>
      <p style="font-size:14px;color:#666;margin:6px 0;"><b>Doručenie:</b> ${esc(opts.deliverySummary)}</p>

      <table role="presentation" aria-hidden="true" style="margin-top:8px;">
        <thead><tr><th>Položka</th><th style="text-align:right;">Spolu</th></tr></thead>
        <tbody>
          ${itemsRows}
          <tr><td style="padding:8px 12px;border-top:2px solid #eee;color:#333;">Doprava</td>
              <td align="right" style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${money(opts.shippingFee)}</td></tr>
          <tr><td style="padding:10px 12px;border-top:1px solid #eee;font-weight:700;color:#111;">Celkom</td>
              <td align="right" style="padding:10px 12px;border-top:1px solid #eee;font-weight:700;color:#111;">${money(opts.totalWithShipping)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="footer">
      <p>
        Slovenská ľudová majolika<br>
        Dolná 138, 900 01 Modra<br>
        IČO: 00 167 975 | DIČ: 2020360155<br>
        IBAN: SK97 0900 0000 0051 3558 7112 (SLSP)<br>
        <a href="mailto:majolika@majolika.sk">majolika@majolika.sk</a> | <a href="mailto:info@majolika.sk">info@majolika.sk</a><br>
        <a href="tel:+421911980105">+421 911 980 105</a><br><br>
        Otváracie hodiny: Po–Pia 8:00–16:00 | So–Ne 10:00–16:00
      </p>
      <div class="footer-logo">
        <img src="https://staging.d2y68xwoabt006.amplifyapp.com/assets/img/logo-SLM-modre.gif" alt="SLM logo" />
      </div>
    </div>
  </div>
</body>
</html>`;
}

function summarizeDeliveryFromOrder(order: OrderRecord | any): string {
  switch (order?.deliveryMethod) {
    case 'pickup': return 'Osobné vyzdvihnutie na mieste';
    case 'post_office': return `Na poštu (ID: ${esc(order?.deliveryDetails?.postOfficeId || '-')} )`;
    case 'packeta_box':
      return order?.deliveryDetails?.notes
        ? `Packeta/Carrier box: ${esc(order.deliveryDetails.notes)}`
        : `Packeta Box (ID: ${esc(order?.deliveryDetails?.packetaBoxId || '-')} )`;
    case 'post_courier': {
      const a = order?.deliveryAddress || {};
      return `Kuriér na adresu: ${esc(a.street)}, ${esc(a.city)} ${esc(a.zip)}, ${esc(a.country)}`;
    }
    default: return esc(String(order?.deliveryMethod || ''));
  }
}

// ========================= DB & Comgate helpery =========================

// načítaj objednávku + očakávanú sumu v centoch
async function getOrderAndExpectedCents(orderId: number) {
  const ord = await strapi.entityService.findOne('api::order.order', orderId, {
    populate: ['items', 'deliveryAddress', 'deliveryDetails'],
    fields: [
      'id','total','totalWithShipping','customerEmail','customerName',
      'paymentStatus','deliveryMethod',
    ] as any,
  }) as unknown as OrderRecord | null;
  if (!ord) throw new Error('Order not found');
  const totalNum = Number(ord.totalWithShipping ?? ord.total ?? 0);
  const expectedCents = Math.round(totalNum * 100);
  return { ord, expectedCents };
}

// volanie Comgate /status s timeoutom
async function comgateStatus(transId: string) {
  const body = qs.stringify({ merchant: MERCHANT, transId, secret: SECRET });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const res = await fetch(`${API}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    const txt = await res.text();
    const parsed = Object.fromEntries(new URLSearchParams(txt));

    // log bez PII
    strapi.log.info(`[COMGATE][STATUS][OUT] code=${parsed.code} transId=${parsed.transId} status=${parsed.status} price=${parsed.price} curr=${parsed.curr}`);
    return parsed as any; // očakávame { code, message, transId, status, price, curr, refId, ... }
  } catch (e) {
    strapi.log.error('[COMGATE][STATUS] request failed:', String(e));
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function clampLabel(s: string | undefined, def = 'Order') {
  const v = (s || def).trim();
  return v.length <= 16 ? v : v.slice(0, 16);
}

function mapComgateToOrder(s: string): PaymentStatus {
  const st = String(s || '').toUpperCase();
  if (st === 'PAID') return 'paid';
  if (AUTH_AS_PAID && st === 'AUTHORIZED') return 'paid';
  if (st === 'REFUNDED' || st === 'PARTIALLY_REFUNDED') return 'refunded';
  return 'unpaid'; // CANCELLED, PENDING, TIMEOUT, ERROR, ...
}

// Post-paid flow (e-maily, bookingy, packeta)
async function runPostPaidFlow(orderId: number) {
  const freshOrder = (await strapi.entityService.findOne('api::order.order', orderId, {
    populate: ['deliveryAddress', 'deliveryDetails', 'items'],
  })) as unknown as OrderRecord;

  // bookingy
  if (freshOrder.temporaryId) {
    const res = await strapi.db.query('api::event-booking.event-booking').updateMany({
      where: { temporaryId: freshOrder.temporaryId, orderId: null },
      data: { orderId: String(freshOrder.id), status: 'paid' },
    });
    strapi.log.info(`[COMGATE][BOOKINGS] temporaryId -> paid (${res.count})`);
  }
  const res2 = await strapi.db.query('api::event-booking.event-booking').updateMany({
    where: { orderId: String(freshOrder.id) },
    data: { status: 'paid' },
  });
  strapi.log.info(`[COMGATE][BOOKINGS] by orderId -> paid (${res2.count})`);

  // priprava položiek pre email
  const orderItems = Array.isArray(freshOrder.items) ? freshOrder.items : [];
  const emailItems = await Promise.all(
    orderItems.map(async (it) => {
      let image = '';
      try {
        if (it.productId) {
          const product = await strapi.entityService.findOne('api::product.product', it.productId, {
            populate: {
              picture_new: { fields: ['url', 'formats'] },
              pictures_new: { fields: ['url', 'formats'] },
            },
          });
          image = pickProductImage(product);
        }
      } catch (e) {
        strapi.log.warn(`[EMAIL][ORDER ITEMS] Nepodarilo sa načítať produkt ${it.productId}: ${String(e)}`);
      }
      return {
        productName: it.productName || `Produkt #${it.productId}`,
        unitPrice: Number(it.unitPrice),
        quantity: Number(it.quantity),
        image,
        event: (it as any).event || null,
      };
    })
  );

  const FRONTEND_URL = process.env.FRONTEND_URL || '';
  const to = freshOrder.customerEmail;
  const deliverySummary = summarizeDeliveryFromOrder(freshOrder);
  const shippingFee = Number(freshOrder.shippingFee || 0);
  const totalWithShipping = Number(freshOrder.totalWithShipping || freshOrder.total || 0);

  const customerEmailHtml = renderOrderEmail({
    title: 'Potvrdenie objednávky – platba prijatá',
    heading: 'Ďakujeme, platba prijatá',
    introLines: [
      `Dobrý deň${freshOrder.customerName ? `, ${freshOrder.customerName}` : ''}.`,
      `Platba za vašu objednávku #${freshOrder.id} prebehla úspešne.`,
    ],
    cta: FRONTEND_URL ? {
      label: 'Zobraziť objednávku',
      href: `${FRONTEND_URL.replace(/\/$/, '')}/checkout/success?order=${freshOrder.id}`,
    } : null,
    items: emailItems,
    shippingFee,
    totalWithShipping,
    deliverySummary,
  });

  const adminEmailHtml = renderOrderEmail({
    title: `Nová objednávka #${freshOrder.id} – zaplatené`,
    heading: `Nová objednávka #${freshOrder.id} – platba prijatá`,
    introLines: [
      `Zákazník: ${freshOrder.customerName || '-'} (${freshOrder.customerEmail || '-'})`,
      `Doručenie: ${deliverySummary}`,
    ],
    cta: null,
    items: emailItems,
    shippingFee,
    totalWithShipping,
    deliverySummary,
  });

  try {
    if (to) {
      await sendEmail({ to, subject: 'Potvrdenie objednávky – platba prijatá', html: customerEmailHtml });
      strapi.log.info(`[EMAIL] Sent to customer [redacted] for order #${freshOrder.id}`);
    } else {
      strapi.log.warn(`[EMAIL] Chýba zákaznícky e-mail pri objednávke #${freshOrder.id}`);
    }
    await sendEmail({ to: 'info@appdesign.sk', subject: `Nová objednávka #${freshOrder.id} – zaplatené`, html: adminEmailHtml });
    strapi.log.info(`[EMAIL] Sent to admin for order #${freshOrder.id}`);
  } catch (e) {
    strapi.log.error('[COMGATE][EMAIL] send failed:', e);
  }

  // (VOLITEĽNÉ) Packeta po úhrade – nechávam ako u teba
  try {
    const autoCreate = String(process.env.PACKETA_AUTO_CREATE_ON_PAID || '').toLowerCase() === 'true';
    if (autoCreate && freshOrder?.deliveryMethod === 'packeta_box' && freshOrder?.deliveryDetails?.packetaBoxId) {
      strapi.log.info('[PACKETA][AUTO] Creating shipment for order #' + freshOrder.id);
      const result = await strapi.service('api::packeta.packeta').createShipmentFromOrder(freshOrder);
      try {
        await strapi.db.query('api::order.order').update({
          where: { id: freshOrder.id },
          data: {
            // shipmentId: result?.shipmentId || null,
            // trackingNumber: result?.trackingNumber || null,
            // labelUrl: result?.labelUrl || null,
          },
        });
      } catch {
        strapi.log.info('[PACKETA][AUTO] Shipment created (not persisted in order): ' + JSON.stringify(result));
      }
    }
  } catch (e: any) {
    strapi.log.error('[PACKETA][AUTO] createShipment failed:', e?.message || e);
  }
}

// ========================= Controller =========================
export default {
  async ping(ctx) {
    strapi.log.info('[COMGATE] ping ok');
    return ctx.send({ ok: true });
  },

  // 1) Založenie platby – ignoruj FE sumu/email, ber z DB
  async create(ctx) {
    try {
      const { orderId } = ctx.request.body || {};
      if (!MERCHANT || !SECRET) ctx.throw(500, 'Comgate not configured');
      if (!orderId) ctx.throw(400, 'orderId is required');

      strapi.log.info(`[COMGATE][CREATE][IN] body=${redact(ctx.request.body)}`);

      const { ord, expectedCents } = await getOrderAndExpectedCents(Number(orderId));

      const body = qs.stringify({
        merchant: MERCHANT,
        test: TEST ? 'true' : 'false',
        country: 'SK',
        price: expectedCents,         // centy z DB
        curr: 'EUR',
        label: clampLabel(`Order #${ord.id}`),
        refId: String(ord.id),        // ref na našu objednávku
        method: 'ALL',
        email: ord.customerEmail || '',     // z DB
        fullName: ord.customerName || 'Customer',
        prepareOnly: 'true',
        url_paid: process.env.RETURN_PAID,
        url_cancelled: process.env.RETURN_CANCELLED,
        url_pending: process.env.RETURN_PENDING,
        secret: SECRET,
      });

      const res = await fetch(`${API}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/x-www-form-urlencoded' },
        body,
      });

      const txt = await res.text();
      const parsed = Object.fromEntries(new URLSearchParams(txt));
      strapi.log.info(`[COMGATE][CREATE][OUT] code=${parsed.code} transId=${parsed.transId}`);

      if (parsed.code !== '0') {
        strapi.log.error('[COMGATE][CREATE] error:', parsed);
        ctx.throw(400, parsed.message || 'Comgate create error');
      }

      // ulož transId + nastav unpaid
      try {
        await strapi.db.query('api::order.order').update({
          where: { id: Number(ord.id) },
          data: { comgateTransId: parsed.transId, paymentStatus: 'unpaid' },
        });
      } catch (e) {
        strapi.log.warn(`[COMGATE][CREATE] could not persist transId for order ${ord.id}: ${String(e)}`);
      }

      ctx.body = {
        transId: parsed.transId,
        paymentUrl: decodeURIComponent(parsed.redirect),
        message: parsed.message,
      };
    } catch (err: any) {
      strapi.log.error('[COMGATE][CREATE] failed:', err?.message || err);
      throw err;
    }
  },

  // 2) Webhook (push)
  async webhook(ctx) {
    strapi.log.info(`[COMGATE][WEBHOOK][IN] body=${redact(ctx.request.body)}`);

    // form v1 / json v2
    let data: any = {};
    try {
      if (typeof ctx.request.body === 'string') {
        data = Object.fromEntries(new URLSearchParams(ctx.request.body));
      } else if (ctx.request.is('application/x-www-form-urlencoded')) {
        data = ctx.request.body;
      } else {
        data = ctx.request.body || {};
      }
    } catch { data = {}; }

    const transId = data.transId || data.id;
    const refId = data.refId;

    if (!transId) {
      strapi.log.error('[COMGATE][WEBHOOK] missing transId');
      ctx.status = 400;
      ctx.body = 'Bad Request';
      return;
    }

    // skutočný stav na Comgate (guard)
    const status = await comgateStatus(String(transId));
    if (String(status.code) !== '0') {
      strapi.log.error('[COMGATE][STATUS] code!=0', status);
      ctx.status = 200; ctx.body = 'OK';
      return;
    }

    // nájdi objednávku podľa transId, prípadne refId
    let order: OrderRecord | null = null;
    try {
      order = (await strapi.db.query('api::order.order').findOne({
        where: { comgateTransId: String(transId) },
        select: ['id','paymentStatus','comgateTransId'],
      })) as any;

      if (!order && refId) {
        order = (await strapi.db.query('api::order.order').findOne({
          where: { id: Number(refId) },
          select: ['id','paymentStatus','comgateTransId'],
        })) as any;
      }
    } catch (e) {
      strapi.log.error('[COMGATE][WEBHOOK] order lookup error:', e);
    }

    if (!order) {
      strapi.log.error(`[COMGATE][WEBHOOK] No order found for transId=${transId}, refId=${refId || '-'}`);
      ctx.status = 200; ctx.body = 'OK';
      return;
    }

    // --- Bezpečnostné matchovanie: refId / price / curr
    const statusRefId = Number(status.refId || status.refID || status.reference || 0);
    const statusCurr = String(status.curr || status.currency || '').toUpperCase();
    const statusPrice = Number(status.price || status.amount || 0); // centy

    const { expectedCents } = await getOrderAndExpectedCents(order.id);

    if (statusRefId && statusRefId !== order.id) {
      strapi.log.warn(`[COMGATE][GUARD] refId mismatch transId=${transId} got=${statusRefId} expected=${order.id}`);
      ctx.status = 200; ctx.body = 'OK'; return;
    }
    if (statusCurr && statusCurr !== 'EUR') {
      strapi.log.warn(`[COMGATE][GUARD] currency mismatch transId=${transId} got=${statusCurr}`);
      ctx.status = 200; ctx.body = 'OK'; return;
    }
    if (statusPrice && statusPrice !== expectedCents) {
      strapi.log.warn(`[COMGATE][GUARD] amount mismatch transId=${transId} got=${statusPrice} expected=${expectedCents}`);
      ctx.status = 200; ctx.body = 'OK'; return;
    }

    const mapped = mapComgateToOrder(String(status.status || ''));
    strapi.log.info(`[COMGATE][WEBHOOK][MAP] transId=${transId} status=${String(status.status)} -> ${mapped}`);

    const prev: PaymentStatus | null = (order.paymentStatus ?? null) as PaymentStatus | null;
    let next: PaymentStatus = prev ?? 'unpaid';

    // nedovoľ downgrade
    if (mapped === 'paid' && prev !== 'paid') next = 'paid';
    else if (mapped === 'refunded' && prev !== 'refunded') next = 'refunded';
    else if (mapped === 'unpaid' && (!prev || prev === 'unpaid')) next = 'unpaid';

    const needStatusChange = next !== prev;
    const needTransPersist = order.comgateTransId !== String(transId);

    if (needStatusChange || needTransPersist) {
      try {
        const updated = await strapi.db.query('api::order.order').update({
          where: { id: order.id },
          data: { paymentStatus: next, comgateTransId: String(transId) },
          select: ['id','paymentStatus'],
        });
        strapi.log.info(`[COMGATE][ORDER] #${updated.id} ${prev || '-'} -> ${updated.paymentStatus}`);
      } catch (e) {
        strapi.log.error('[COMGATE][ORDER UPDATE] error:', e);
      }
    } else {
      strapi.log.info(`[COMGATE][ORDER] #${order.id} no change (prev=${prev}, mapped=${mapped})`);
    }

    // post-paid flow pri prvom prechode na paid
    if (next === 'paid' && prev !== 'paid') {
      try {
        await runPostPaidFlow(order.id);
      } catch (e) {
        strapi.log.error('[COMGATE][WEBHOOK][AFTER-PAID] error:', e);
      }
    }

    ctx.status = 200;
    ctx.body = 'OK';
  },

  // 3) FE status/polling (tiež s guardami a post-paid flow)
  async status(ctx) {
    const { transId, orderId } = ctx.request.body || {};
    let t: string | null = transId || null;
    let ord: { id: number; paymentStatus?: PaymentStatus | null } | null = null;

    // ak FE pošle len orderId, nájdi transId
    if (!t && orderId) {
      const o = await strapi.db.query('api::order.order').findOne({
        where: { id: Number(orderId) },
        select: ['id','comgateTransId','paymentStatus'],
      });
      ord = o as any;
      t = o?.comgateTransId || null;
      if (!t) {
        return ctx.send({
          ok: true,
          transId: null,
          paymentStatus: (o?.paymentStatus as PaymentStatus) || 'unpaid',
          source: 'db',
        });
      }
    }

    if (!t) return ctx.badRequest('transId or orderId is required');

    const s = await comgateStatus(String(t));
    if (String(s.code) !== '0') {
      return ctx.send({ ok: true, transId: t, comgateRaw: s, paymentStatus: ord?.paymentStatus || 'unpaid', source: 'comgate' });
    }

    // nájdeme order podľa transId
    const o2 = await strapi.db.query('api::order.order').findOne({
      where: { comgateTransId: String(t) },
      select: ['id','paymentStatus'],
    });
    if (!o2) {
      return ctx.send({ ok: true, transId: t, comgateRaw: s, paymentStatus: 'unpaid', source: 'comgate' });
    }

    // GUARD: refId/curr/price
    const statusRefId = Number(s.refId || s.refID || s.reference || 0);
    const statusCurr = String(s.curr || s.currency || '').toUpperCase();
    const statusPrice = Number(s.price || s.amount || 0); // centy

    const { expectedCents } = await getOrderAndExpectedCents(o2.id);
    if ((statusRefId && statusRefId !== o2.id) || (statusCurr && statusCurr !== 'EUR') || (statusPrice && statusPrice !== expectedCents)) {
      // nedôveryhodné — neprepíname DB, len vraciame aktuálny stav DB
      return ctx.send({
        ok: true,
        transId: t,
        comgateRaw: s,
        paymentStatus: (o2.paymentStatus as PaymentStatus) || 'unpaid',
        source: 'comgate',
        note: 'guard_mismatch',
      });
    }

    const normalized = mapComgateToOrder(String(s.status || ''));
    const prev = (o2.paymentStatus as PaymentStatus | null) ?? 'unpaid';

    if (prev !== normalized) {
      await strapi.db.query('api::order.order').update({
        where: { id: o2.id },
        data: { paymentStatus: normalized },
      });
      strapi.log.info(`[COMGATE][STATUS][SYNC] #${o2.id} ${prev || '-'} -> ${normalized}`);

      if (normalized === 'paid' && prev !== 'paid') {
        try {
          await runPostPaidFlow(o2.id);
        } catch (e) {
          strapi.log.error('[COMGATE][STATUS][AFTER-PAID] error:', e);
        }
      }
    }

    ctx.send({
      ok: true,
      transId: t,
      comgateRaw: s,
      paymentStatus: normalized,
      source: 'comgate',
    });
  },
};
