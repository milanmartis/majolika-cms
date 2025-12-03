// src/api/payment/controllers/payment.ts
import qs from 'qs';
import fetch from 'node-fetch';
import { sendEmail } from '../../../utils/email';
import { recalcSessionsByTemporaryId, recalcSessionsByOrderId } from '../../../utils/sessions';

// ========================= Comgate ENV =========================
const API = process.env.COMGATE_API || 'https://payments.comgate.cz/v1.0';
const MERCHANT = process.env.COMGATE_MERCHANT || '';
const SECRET = process.env.COMGATE_SECRET || '';
const TEST = String(process.env.COMGATE_TEST || 'false').toLowerCase() === 'true';
// Ak je true, ber AUTHORIZED ako "paid" (v testoch sa často vracia AUTHORIZED)
const AUTH_AS_PAID = String(process.env.COMGATE_AUTHORIZED_AS_PAID || 'false').toLowerCase() === 'true';

// ========================= Typy =========================
type PaymentStatus = 'unpaid' | 'paid' | 'refunded';
type OrderStatus = 'pending' | 'confirmed' | 'cancelled';
type FulfillmentStatus = 'new' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

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
  slug?: string;
  quantity: number;
  unitPrice: number;
  event?: EventInfo | null;
  imageUrl?: string;
  isDigitalProduct?: boolean;
  isGiftVoucher?: boolean;   
};

type DeliveryMethod = 'pickup' | 'post_office' | 'packeta_box' | 'post_courier' | 'digital_product';

type OrderRecord = {
  id: number;
  notes?: string | null;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  shippingFee?: number | string;
  total?: number | string;
  totalWithShipping?: number | string;
  deliveryMethod?: DeliveryMethod;

  shippingAddress?: {
    street?: string;
    city?: string;
    zip?: string;
    country?: string;
  } | null;

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

  temporaryId?: string | null;
  items?: OrderItem[];

  paymentStatus?: PaymentStatus | null;
  comgateTransId?: string | null;

  orderStatus?: OrderStatus | null;
  fulfillmentStatus?: FulfillmentStatus | null;
  deliveryUrgency?: 'standard' | 'rush' | string | null;

  customer?: {
    id: number;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    street?: string | null;
    city?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null;
};

// ========================= Helpery (bezpečnosť, render, logy) =========================

function redact(obj: unknown) {
  try {
    const o =
      typeof obj === 'string'
        ? Object.fromEntries(new URLSearchParams(obj))
        : { ...(obj as Record<string, unknown> || {}) };
    for (const k of ['email', 'fullName', 'customerEmail', 'customerName', 'phone', 'name', 'full_name']) {
      if ((o as any)[k] != null) (o as any)[k] = '[redacted]';
    }
    if ((o as any).secret) (o as any).secret = '[redacted]';
    return JSON.stringify(o);
  } catch {
    return '[unserializable]';
  }
}

function sanitizeComgateRaw(x: any) {
  try {
    const o = { ...(x || {}) };
    for (const k of [
      'secret',
      'email',
      'name',
      'full_name',
      'payer_name',
      'payerName',
      'payer_acc',
      'payerAcc',
      'billing_addr_city',
      'billing_addr_street',
      'billing_addr_postal_code',
      'billing_addr_country',
      'home_delivery_city',
      'home_delivery_street',
      'home_delivery_postal_code',
      'home_delivery_country',
    ]) {
      if ((o as any)[k] != null) (o as any)[k] = '[redacted]';
    }
    return o;
  } catch {
    return {};
  }
}

function esc(s?: string) {
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function aesc(s?: string) {
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function absUrl(url?: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;

  const serverUrl = (strapi.config?.get?.('server.url') as string) || '';
  const base =
    process.env.PUBLIC_UPLOADS_URL ||
    process.env.UPLOADS_BASE_URL ||
    serverUrl ||
    process.env.FRONTEND_URL || // posledný fallback, nech je absolútna
    '';

  if (!base) {
    strapi.log.warn('[EMAIL][IMG] Missing base URL; cannot build absolute image URL');
    return ''; // radšej prázdne -> renderer použije logo, nie rozbitý <img>
  }
  return `${String(base).replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
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

function money(n: number) { return `${n.toFixed(2)} €`; }

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
  slug: string;
  unitPrice: number;
  quantity: number;
  image?: string;
  event?: EventInfo | null;

  // 👇 pridáme, aj keď môžu byť undefined
  isDigitalProduct?: boolean;
  isGiftVoucher?: boolean;
}>) {
  return items.map((it) => {
    const subtotal = it.unitPrice * it.quantity;
    const eventLine = it?.event?.startDateTime
      ? `<div style="font-size:13px;color:#0e29a0;padding:4px 4px 0 4px;">${esc(formatEventSk(it.event!))}</div>`
      : '';

    const digitalBadge =
      it.isDigitalProduct || it.isGiftVoucher
        ? `<div style="font-size:12px;color:#0e29a0;padding:2px 4px 0 4px;">Digitálny produkt / darčekový poukaz</div>`
        : '';

    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${it.image
              ? `<img src="${aesc(it.image)}" alt="" width="64" height="64" style="object-fit:cover;border-radius:0px;" />`
              : '<img src="https://www.majolika.sk/assets/img/logo-SLM-modre.gif" alt="" width="64" height="64" style="object-fit:cover;border-radius:0px;" />'}
            <div>
              <div style="font-weight:600;color:#333;padding:4px;">
                <a href="https://www.majolika.sk/produkt/${it.slug}"
                  style="color:#0e29a0;text-decoration:none;"
                  target="_blank">
                  ${esc(it.productName)}
                </a>
              </div>
              ${digitalBadge}
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
  }).join('');
}

function renderOrderEmail(opts: {
  title: string;
  heading: string;
  introLines: string[];
  cta?: { label: string; href: string } | null;
  items: Array<{ productName: string; slug: string; unitPrice: number; quantity: number; image?: string; event?: EventInfo | null; isDigitalProduct?: boolean;
    isGiftVoucher?: boolean; }>;
  shippingFee: number;
  paymentFee: number; 
  totalWithShipping: number;
  deliverySummary: string;
  orderNotes?: string | null;
  billingHtml?: string | null;
}) {
  const itemsRows = renderItemsRows(opts.items);
  const notesHtml = opts.orderNotes
  ? `<div style="margin-top:16px;padding:12px;border:1px solid #eaeaea;border-radius:6px;background:#fcfcfc;">
       <div style="font-weight:600;color:#333;margin-bottom:6px;">Poznámka k objednávke</div>
       <div style="font-size:14px;color:#444;line-height:1.5;">${esc(opts.orderNotes).replace(/\n/g, '<br>')}</div>
     </div>`
  : '';
  return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <title>${esc(opts.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; border-radius: 0px; box-shadow: 0 0 10px rgba(0,0,0,0.05); overflow: hidden; }
    .header { background-color: #0e29a0; color: white; padding: 24px; text-align: center; }
    .content { padding: 32px; }
    .content h2 { margin-top: 0; color: #333; }
    .content p { font-size: 16px; line-height: 1.6; color: #444; }
    .button { display: inline-block; margin-top: 24px; padding: 12px 24px; background-color: #0e29a0; color: white !important; text-decoration: none; border-radius: 0px; font-weight: bold; transition: background-color 0.3s ease; }
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
 

      <h3 style="color:#333;margin-top:32px;">Zhrnutie objednávky</h3>
      <p style="font-size:14px;color:#666;margin:6px 0;"><b>Doručenie:</b> ${esc(opts.deliverySummary)}</p>
      ${opts.billingHtml || ''}
      ${notesHtml}

      <table role="presentation" aria-hidden="true" style="margin-top:8px;">
        <thead><tr><th>Položka</th><th style="text-align:right;">Spolu</th></tr></thead>
        <tbody>
          ${itemsRows}
          <tr><td style="padding:8px 12px;border-top:2px solid #eee;color:#333;">Doprava</td>
              <td align="right" style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${money(opts.shippingFee)}</td></tr>
          <tr><td style="padding:8px 12px;border-top:2px solid #eee;color:#333;">Poplatok za dobierku</td>
              <td align="right" style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${money(opts.paymentFee)}</td></tr>
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
        <img src="https://www.majolika.sk/assets/img/logo-SLM-modre.gif" alt="SLM logo" width="200" />
      </div>
    </div>
  </div>
</body>
</html>`;
}

function summarizeDeliveryFromOrder(order: OrderRecord | any): string {
  let base: string;

  switch (order?.deliveryMethod) {
    case 'pickup':
      base = 'Osobné vyzdvihnutie na mieste';
      break;

    case 'post_office': {
      const a = (order?.deliveryAddress || {}) as {
        street?: string;
        city?: string;
        zip?: string;
        country?: string;
      };
      const addrStr = [a.street, a.city, a.zip].filter(Boolean).join(', ');
      const id = order?.deliveryDetails?.postOfficeId || '';

      if (addrStr && id) {
        base = `Na poštu: ${esc(addrStr)} (ID: ${esc(id)})`;
      } else if (addrStr) {
        base = `Na poštu: ${esc(addrStr)}`;
      } else {
        base = `Na poštu (ID: ${esc(id || '-')})`;
      }
      break;
    }

    case 'packeta_box':
      base = order?.deliveryDetails?.notes
        ? `Packeta/Carrier box: ${esc(order.deliveryDetails.notes)}`
        : `Packeta Box (ID: ${esc(order?.deliveryDetails?.packetaBoxId || '-')})`;
      break;

    case 'post_courier': {
      const a = order?.deliveryAddress || {};
      base = `Kuriér na adresu: ${esc(a.street)}; ${esc(a.city)} ${esc(a.zip)}, ${esc(a.country)}`;
      break;
    }

    case 'digital_product':
      base = 'Digitálny produkt (bez fyzického doručenia)';
      break;

    default:
      base = esc(String(order?.deliveryMethod || ''));
      break;
  }

  const u = (order as any).deliveryUrgency;
  const suffix =
    u === 'rush'
      ? ' – objednávka ponáhľa'
      : u === 'standard'
        ? ' – štandardná doba dodania (cca 2 týždne)'
        : '';

  return base + suffix;
}



// ========================= DB & Comgate helpery =========================

async function markOrderCancelled(orderId: number) {
  try {
    const current = await strapi.db.query('api::order.order').findOne({
      where: { id: orderId },
      select: ['id', 'orderStatus', 'fulfillmentStatus', 'paymentStatus'],
    }) as any;

    const needOrder = current?.orderStatus !== 'cancelled';
    const needFull = current?.fulfillmentStatus !== 'cancelled';
    const needPay = current?.paymentStatus !== 'unpaid';

    if (needOrder || needFull || needPay) {
      await strapi.db.query('api::order.order').update({
        where: { id: orderId },
        data: { orderStatus: 'cancelled', fulfillmentStatus: 'cancelled', paymentStatus: 'unpaid' },
      });
      strapi.log.info(`[COMGATE][ORDER] #${orderId} marked cancelled`);
    }
  } catch (e) {
    strapi.log.error(`[COMGATE][ORDER CANCEL] update failed #${orderId}:`, e);
  }
}

function isCancelledLike(s?: string) {
  const u = String(s || '').toUpperCase();
  return u === 'CANCELLED' || u === 'CANCELED' || u === 'REJECTED' || u === 'TIMEOUT' || u === 'EXPIRED';
}

async function getOrderAndExpectedCents(orderId: number) {
  const ord = (await strapi.entityService.findOne('api::order.order', orderId, {
    populate: ['items', 'deliveryAddress', 'deliveryDetails'],
    fields: ['id','total','totalWithShipping','customerEmail','customerName', 'customerPhone', 'paymentStatus','deliveryMethod'] as any,
  })) as unknown as OrderRecord | null;

  if (!ord) throw new Error('Order not found');
  const totalNum = Number(ord.totalWithShipping ?? ord.total ?? 0);
  if (!Number.isFinite(totalNum) || totalNum <= 0) throw new Error('Invalid order total');
  const expectedCents = Math.round(totalNum * 100);
  return { ord, expectedCents };
}

async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 8000): Promise<any> {
  return await Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), timeoutMs)),
  ]);
}

async function comgateStatus(transId: string) {
  const body = qs.stringify({ merchant: MERCHANT, transId, secret: SECRET });

  const res: any = await fetchWithTimeout(
    `${API}/status`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/x-www-form-urlencoded' },
      body,
    },
    8000
  );

  const txt = await res.text();
  const parsed = Object.fromEntries(new URLSearchParams(txt));

  strapi.log.info(
    `[COMGATE][STATUS][OUT] code=${parsed.code} transId=${parsed.transId} status=${parsed.status} price=${parsed.price} curr=${parsed.curr}`
  );

  return parsed as any;
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

async function runPostPaidFlow(orderId: number) {
  const freshOrder = await strapi.entityService.findOne('api::order.order', orderId, {
    fields: [
      'id',
      'notes',
      'shippingFee',
      'paymentFee',
      'total',
      'totalWithShipping',
      'customerEmail',
      'customerName',
      'customerPhone',
      'deliveryMethod',
      'temporaryId',
      'deliveryUrgency',
      'shippingAddress',
      'billingIsCompany',
      'billingCompanyName',
      'billingIco',
      'billingDic',
      'billingIcDph',
    ] as any,
    populate: {
      deliveryAddress: true,
      deliveryDetails: true,
      items: true,
      customer: true,
      billingAddress: true,
    },
  }) as unknown as OrderRecord;

  const orderNotes = freshOrder?.notes ? String(freshOrder.notes) : null;
  strapi.log.info(`[EMAIL][PAID] notes="${orderNotes ?? ''}"`);

  const customerPhone =
    (freshOrder as any).customerPhone ||
    freshOrder.customer?.phone ||
    '';

  // Previazanie bookingov
  if (freshOrder.temporaryId) {
    const res = await strapi.db.query('api::event-booking.event-booking').updateMany({
      where: { temporaryId: freshOrder.temporaryId, orderId: null },
      data: {
        orderId: String(freshOrder.id),
        status: 'paid',
        customerEmail: freshOrder.customerEmail || undefined,
        customerName:  freshOrder.customerName  || undefined,
        customerPhone: customerPhone || undefined,
      },
    });
    strapi.log.info(`[COMGATE][BOOKINGS] temporaryId -> paid (${res.count})`);
  }
  const res2 = await strapi.db.query('api::event-booking.event-booking').updateMany({
    where: { orderId: String(freshOrder.id) },
    data: {
      status: 'paid',
      customerEmail: freshOrder.customerEmail || undefined,
      customerName:  freshOrder.customerName  || undefined,
      customerPhone: customerPhone || undefined,
    },
  });
  strapi.log.info(`[COMGATE][BOOKINGS] by orderId -> paid (${res2.count})`);

  try {
    if (freshOrder.temporaryId) {
      await recalcSessionsByTemporaryId(freshOrder.temporaryId);
    }
    await recalcSessionsByOrderId(freshOrder.id);
  } catch (e) {
    strapi.log.error('[GCAL][AFTER-PAID] recalc failed:', e);
  }

  // Zloženie položiek pre email (s obrázkami)
  const orderItems = Array.isArray(freshOrder.items) ? freshOrder.items : [];
  const hasEventSession = orderItems.some((it: any) => it?.event?.sessionId);
  const emailItems = await Promise.all(
    orderItems.map(async (it) => {
      // preferuj imageUrl uložené v order.items
      let image = (it as any).imageUrl || '';
      image = absUrl(image);
      // fallback – načítanie z produktu
      if (!image && it.productId) {
        try {
          const pid = Number(it.productId);
          if (Number.isFinite(pid)) {
            const product = await strapi.entityService.findOne('api::product.product', pid, {
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
      }

      return {
        productName: it.productName || `Produkt #${it.productId}`,
        slug: it.slug || '',
        unitPrice: Number(it.unitPrice),
        quantity: Number(it.quantity),
        image: image || 'https://www.majolika.sk/assets/img/logo-SLM-modre.gif',
        event: (it as any).event || null,
  
        // 👇 prenesieme flagy z order.items
        isDigitalProduct: !!(it as any).isDigitalProduct || !!(it as any).isGiftVoucher,
        isGiftVoucher: !!(it as any).isGiftVoucher,
      };
    })
  );

  const FRONTEND_URL = process.env.FRONTEND_URL || '';
  const to = freshOrder.customerEmail;
  const deliverySummary = summarizeDeliveryFromOrder(freshOrder);
  const shippingFee = Number(freshOrder.shippingFee || 0);
  const paymentFee   = Number((freshOrder as any).paymentFee || 0);
  const totalWithShipping = Number(freshOrder.totalWithShipping || freshOrder.total || 0);

  const billingFromOrder = {
    isCompany: !!freshOrder.billingIsCompany,
    companyName: freshOrder.billingCompanyName || '',
    ico: freshOrder.billingIco || '',
    dic: freshOrder.billingDic || '',
    icDph: freshOrder.billingIcDph || '',
    address: freshOrder.billingAddress || null,
  };

  const billingHtml =
    billingFromOrder.isCompany
      ? `
        <div style="margin:16px 0;padding:12px;border:1px solid #eaeaea;border-radius:0px;background:#fcfcfc;">
          <div style="font-weight:600;color:#333;margin-bottom:6px;">Fakturačné údaje</div>
          <div style="font-size:14px;color:#444;line-height:1.5;">
            ${esc(billingFromOrder.companyName)}<br/>
            IČO: ${esc(billingFromOrder.ico)}<br/>
            ${billingFromOrder.dic ? `DIČ: ${esc(billingFromOrder.dic)}<br/>` : ''}
            ${billingFromOrder.icDph ? `IČ DPH: ${esc(billingFromOrder.icDph)}<br/>` : ''}
            ${
              billingFromOrder.address
                ? `${esc(billingFromOrder.address.street || '')}, ${esc(
                    billingFromOrder.address.zip || '',
                  )} ${esc(billingFromOrder.address.city || '')}, ${esc(
                    billingFromOrder.address.country || '',
                  )}`
                : ''
            }
          </div>
        </div>`
      : '';

  const customerEmailHtml = renderOrderEmail({
    title: `Potvrdenie objednávky ${freshOrder.id}`,
    heading: 'Ďakujeme, platba prijatá',
    introLines: [
      `Dobrý deň${freshOrder.customerName ? `, ${esc(freshOrder.customerName)}` : ''}.`,
      `Platba za vašu objednávku #${freshOrder.id} prebehla úspešne.`,
    ],
    cta: FRONTEND_URL
      ? {
          label: 'Zobraziť objednávku',
          href: `${FRONTEND_URL.replace(/\/$/, '')}/checkout/success?order=${freshOrder.id}`,
        }
      : null,
    items: emailItems,
    shippingFee,
    paymentFee,
    totalWithShipping,
    deliverySummary,
    orderNotes,
    billingHtml
  });

  const addr = (freshOrder.deliveryAddress || {}) as any;
  const customerPhoneLine =
    customerPhone || (freshOrder as any).phone || '';
  
  // 1) primárne z order.shippingAddress (JSON na objednávke)
  let customerShipping: any = (freshOrder as any).shippingAddress;
  
  // 2) ak chýba, skús customer.shippingAddress (môže byť JSON/string)
  if (!customerShipping) {
    customerShipping = (freshOrder.customer as any)?.shippingAddress;
    if (typeof customerShipping === 'string') {
      try {
        customerShipping = JSON.parse(customerShipping);
      } catch {
        customerShipping = null;
      }
    }
  }
  
  // 3) ak stále nič, fallback na rozbité polia na customer
  if (!customerShipping || typeof customerShipping !== 'object') {
    customerShipping = {
      street:  (freshOrder.customer as any)?.street,
      zip:     (freshOrder.customer as any)?.zip,
      city:    (freshOrder.customer as any)?.city,
      country: (freshOrder.customer as any)?.country,
    };
  }
  
  const customerAddressLine =
    [
      customerShipping.street,
      customerShipping.zip,
      customerShipping.city,
      customerShipping.country,
    ]
      .filter(Boolean)
      .join(', ') || '-';
  
  const adminIntroLines = [
    `Zákazník: ${freshOrder.customerName || '-'}`,
    `E-mail: ${freshOrder.customerEmail || '-'}`,
    `Telefón: ${customerPhoneLine || '-'}`,
    `Adresa zákazníka: ${customerAddressLine}`,
    `Doručovacia adresa: ${
      [addr.street, addr.zip, addr.city, addr.country]
        .filter(Boolean)
        .join(', ') || '-'
    }`,
    '',
    'Produkty (s EAN):',
    ...orderItems.map((it) => {
      const ean =
        (it as any).ean ||
        (it as any).eanCode ||
        (it as any).ean_code ||
        (it as any).ean_kod ||
        '-';
      return `• ${it.productName || `Produkt #${it.productId}`} - EAN: ${ean}, množstvo: ${it.quantity}`;
    }),
  ];

  const adminEmailHtml = renderOrderEmail({
    title: `Nová objednávka #${freshOrder.id} - zaplatené`,
    heading: `Nová objednávka #${freshOrder.id} - platba prijatá`,
    introLines: adminIntroLines,
    cta: null,
    items: emailItems,
    shippingFee,
    paymentFee,
    totalWithShipping,
    deliverySummary,
    orderNotes,
    billingHtml
  });

  try {
    if (to) {
      await sendEmail({ to, subject: 'Potvrdenie objednávky - platba prijatá', html: customerEmailHtml });
      strapi.log.info(`[EMAIL] Sent to customer [redacted] for order #${freshOrder.id}`);
    } else {
      strapi.log.warn(`[EMAIL] Chýba zákaznícky e-mail pri objednávke #${freshOrder.id}`);
    }
    await sendEmail({ to: 'majolika@majolika.sk', subject: `Nová objednávka #${freshOrder.id} - zaplatené`, html: adminEmailHtml });

    const adminEmails = ['info@appdesign.sk', 'filip.funa@majolika.sk', 'romana.uhercikova@majolika.sk', 'katarina.borisova@majolika.sk'];
    if (hasEventSession) {
      adminEmails.push('prehliadky@majolika.sk');
    }
    await sendEmail({
      to: adminEmails.join(','),
      subject: `Nová objednávka #${freshOrder.id} - zaplatené`,
      html: adminEmailHtml,
    });

    strapi.log.info(`[EMAIL] Sent to admin for order #${freshOrder.id}`);
  } catch (e) {
    strapi.log.error('[COMGATE][EMAIL] send failed:', e);
  }

  // Packeta AUTO create
  try {
    const autoCreate = String(process.env.PACKETA_AUTO_CREATE_ON_PAID || '').toLowerCase() === 'true';
    if (autoCreate && freshOrder?.deliveryMethod === 'packeta_box' && freshOrder?.deliveryDetails?.packetaBoxId) {
      strapi.log.info('[PACKETA][AUTO] Creating shipment for order #' + freshOrder.id);
      const result = await (strapi as any).service('api::packeta.packeta').createShipmentFromOrder(freshOrder);
      try {
        await strapi.db.query('api::order.order').update({
          where: { id: freshOrder.id },
          data: {},
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
  // Healthcheck
  async ping(ctx: any) {
    strapi.log.info('[COMGATE] ping ok');
    return ctx.send({ ok: true });
  },

  // 1) Založenie platby
  async create(ctx: any) {
    try {
      const { orderId } = ctx.request.body || {};
      if (!MERCHANT || !SECRET) ctx.throw(500, 'Comgate not configured');
      if (!orderId || !Number.isFinite(Number(orderId))) ctx.throw(400, 'orderId is required');

      strapi.log.info(`[COMGATE][CREATE][IN] body=${redact(ctx.request.body)}`);

      const { ord, expectedCents } = await getOrderAndExpectedCents(Number(orderId));

      const SERVER_URL = (strapi.config?.get?.('server.url') as string) || '';
      const bridgeBase = `${String(SERVER_URL).replace(/\/$/, '')}/api/payments/return`;

      const url_paid      = (process.env.RETURN_PAID      || `${bridgeBase}?status=PAID&refId={refId}&transId={id}`);
      const url_cancelled = (process.env.RETURN_CANCELLED || `${bridgeBase}?status=CANCELLED&refId={refId}&transId={id}`);
      const url_pending   = (process.env.RETURN_PENDING   || `${bridgeBase}?status=PENDING&refId={refId}&transId={id}`);

      // Pozn.: prepareOnly=true → my získame redirect URL a sami presmerujeme FE na Comgate
      const body = qs.stringify({
        merchant: MERCHANT,
        test: TEST ? 'true' : 'false',
        country: 'SK',
        price: expectedCents,
        curr: 'EUR',
        label: clampLabel(`Order #${ord.id}`),
        refId: String(ord.id),
        method: 'ALL',
        email: ord.customerEmail || '',
        fullName: ord.customerName || 'Customer',
        prepareOnly: 'true',
        // návratové URL
        url_paid,
        url_cancelled,
        url_pending,
        secret: SECRET,
      });

      const res: any = await fetchWithTimeout(`${API}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/x-www-form-urlencoded' },
        body,
      }, 8000);

      const txt = await res.text();
      const parsed = Object.fromEntries(new URLSearchParams(txt));
      strapi.log.info(`[COMGATE][CREATE][OUT] code=${parsed.code} transId=${parsed.transId} redirect=${parsed.redirect ? '[present]' : '[missing]'}`);

      if (parsed.code !== '0') {
        strapi.log.error('[COMGATE][CREATE] error:', sanitizeComgateRaw(parsed));
        ctx.throw(400, parsed.message || 'Comgate create error');
      }

      // Ulož transId k objednávke (na istotu)
      try {
        await strapi.db.query('api::order.order').update({
          where: { id: Number(ord.id) },
          data: { comgateTransId: parsed.transId, paymentStatus: 'unpaid' },
        });
      } catch (e) {
        strapi.log.warn(`[COMGATE][CREATE] could not persist transId for order ${ord.id}: ${String(e)}`);
      }

      let paymentUrl = parsed.redirect;
      try { paymentUrl = decodeURIComponent(parsed.redirect); } catch {}

      ctx.body = {
        transId: parsed.transId,
        paymentUrl,
        message: parsed.message,
        debug: { url_paid, url_cancelled, url_pending }
      };
    } catch (err: any) {
      strapi.log.error('[COMGATE][CREATE] failed:', err?.message || err);
      throw err;
    }
  },

  // GET /api/payments/preview-email?order=123&type=paid|noncard&notes=override
  async previewEmail(ctx: any) {
    try {
      const q = ctx.query || {};
      const idQ = Number(q.order || q.orderId || 0) || null;
      const type = String(q.type || 'paid').toLowerCase(); // 'paid' | 'noncard'
      const notesOverride = typeof q.notes === 'string' ? q.notes : undefined;
      const doCheck = String(q.check || '0') === '1';
      const source = String(q.source || 'order'); // 'order' | 'product'

      if (!idQ) return ctx.badRequest('Provide ?order=<orderId>');

      // 1) načítaj objednávku vrátane customer
      const order = await strapi.entityService.findOne('api::order.order', idQ, {
        populate: {
          deliveryAddress: true,
          deliveryDetails: true,
          items: true,
          customer: true,
          billingAddress: true,
        },
      }) as any;
      if (!order) return ctx.notFound('Order not found');

      const billingFromOrder = {
        isCompany: !!order.billingIsCompany,
        companyName: order.billingCompanyName || '',
        ico: order.billingIco || '',
        dic: order.billingDic || '',
        icDph: order.billingIcDph || '',
        address: order.billingAddress || null,
      };

      const billingHtml =
        billingFromOrder.isCompany
          ? `
          <div style="margin:16px 0;padding:12px;border:1px solid #eaeaea;border-radius:0px;background:#fcfcfc;">
            <div style="font-weight:600;color:#333;margin-bottom:6px;">Fakturačné údaje</div>
            <div style="font-size:14px;color:#444;line-height:1.5;">
              ${esc(billingFromOrder.companyName)}<br/>
              IČO: ${esc(billingFromOrder.ico)}<br/>
              ${billingFromOrder.dic ? `DIČ: ${esc(billingFromOrder.dic)}<br/>` : ''}
              ${billingFromOrder.icDph ? `IČ DPH: ${esc(billingFromOrder.icDph)}<br/>` : ''}
              ${
                billingFromOrder.address
                  ? `${esc(billingFromOrder.address.street || '')}, ${esc(
                      billingFromOrder.address.zip || '',
                    )} ${esc(billingFromOrder.address.city || '')}, ${esc(
                      billingFromOrder.address.country || '',
                    )}`
                  : ''
              }
            </div>
          </div>`
          : '';

      // 2) priprav položky
      const items = Array.isArray(order.items) ? order.items : [];
      const diagnostics: Array<{
        name: string; rawFrom: 'order.imageUrl' | 'product.media';
        rawUrl?: string; resolvedUrl?: string; headOk?: boolean; headStatus?: number;
        note?: string;
      }> = [];

      const emailItems = await Promise.all(
        items.map(async (it: any) => {
          let image = '';
          let rawFrom: 'order.imageUrl' | 'product.media' = 'order.imageUrl';
          let rawUrl: string | undefined;

          if (source === 'order') {
            rawUrl = it.imageUrl ? String(it.imageUrl) : '';
            image = absUrl(rawUrl);
          }

          if (!image) {
            try {
              const product = await strapi.entityService.findOne('api::product.product', Number(it.productId), {
                populate: {
                  picture_new: { fields: ['url', 'formats'] },
                  pictures_new: { fields: ['url', 'formats'] },
                },
              });
              rawFrom = 'product.media';
              rawUrl = pickProductImage(product);
              image = rawUrl;
            } catch (e) {
              strapi.log.warn(`[PREVIEW][ITEM IMG] product ${it.productId} load failed: ${String(e)}`);
            }
          }

          let headOk: boolean | undefined;
          let headStatus: number | undefined;
          let note: string | undefined;
          if (doCheck && image) {
            try {
              const res = await fetch(image, { method: 'HEAD' });
              headOk = res.ok;
              headStatus = res.status;
              if (!res.ok) note = 'HEAD not OK – skontroluj PUBLIC_UPLOADS_URL/UPLOADS_BASE_URL a cestu k súboru';
            } catch (e: any) {
              headOk = false; headStatus = 0;
              note = `HEAD error: ${e?.message || e}`;
            }
          }

          diagnostics.push({
            name: it.productName || `Produkt #${it.productId}`,
            rawFrom, rawUrl, resolvedUrl: image, headOk, headStatus, note,
          });

          return {
            productName: it.productName || `Produkt #${it.productId}`,
            slug: it.slug || '',
            unitPrice: Number(it.unitPrice || 0),
            quantity: Number(it.quantity || 1),
            image: image || 'https://www.majolika.sk/assets/img/logo-SLM-modre.gif',
            event: it.event || null,
      
            // 👇 aj v preview chceme vidieť badge
            isDigitalProduct: !!it.isDigitalProduct || !!it.isGiftVoucher,
            isGiftVoucher: !!it.isGiftVoucher,
          };
        })
      );

      // 3) výpočty + sumarizácia
      const shippingFee = Number(order.shippingFee || 0);
      const paymentFee  = Number(order.paymentFee || 0);
      const totalWithShipping = Number(order.totalWithShipping || order.total || 0);
      const deliverySummary = summarizeDeliveryFromOrder(order);
      const FRONTEND_URL = process.env.FRONTEND_URL || '';

      const orderNotes = typeof notesOverride === 'string'
        ? notesOverride
        : (order.notes ? String(order.notes) : null);

      // ADMIN TEXTY
      const addr = (order.deliveryAddress || {}) as any;

      const customerPhoneLine =
        order.customerPhone ||
        order.customer?.phone ||
        '';

      let customerShipping: any = (order as any).shippingAddress;

      if (!customerShipping) {
        customerShipping = (order.customer as any)?.shippingAddress;
        if (typeof customerShipping === 'string') {
          try {
            customerShipping = JSON.parse(customerShipping);
          } catch {
            customerShipping = null;
          }
        }
      }

      if (!customerShipping || typeof customerShipping !== 'object') {
        customerShipping = {
          street:  (order.customer as any)?.street,
          zip:     (order.customer as any)?.zip,
          city:    (order.customer as any)?.city,
          country: (order.customer as any)?.country,
        };
      }

      const customerAddressLine =
        [
          customerShipping.street,
          customerShipping.zip,
          customerShipping.city,
          customerShipping.country,
        ]
          .filter(Boolean)
          .join(', ') || '-';

      strapi.log.info('[PREVIEW] order.shippingAddress = ' + JSON.stringify((order as any).shippingAddress));
      strapi.log.info('[PREVIEW] customer.shippingAddress = ' + JSON.stringify((order.customer as any)?.shippingAddress));
      strapi.log.info('[PREVIEW] customerShipping used = ' + JSON.stringify(customerShipping));
      strapi.log.info('[PREVIEW] customerAddressLine = ' + customerAddressLine);

      const adminIntroLines = [
        `Zákazník: ${order.customerName || '-'}`,
        `E-mail: ${order.customerEmail || '-'}`,
        `Telefón: ${customerPhoneLine || '-'}`,
        `Adresa zákazníka: ${customerAddressLine}`,
        `Doručovacia adresa: ${
          [addr.street, addr.zip, addr.city, addr.country]
            .filter(Boolean)
            .join(', ') || '-'
        }`,
        '',
        'Produkty (s EAN):',
        ...items.map((it: any) => {
          const ean =
            it.ean ||
            it.eanCode ||
            it.ean_code ||
            it.ean_kod ||
            '-';
          return `• ${it.productName || `Produkt #${it.productId}`} - EAN: ${ean}, množstvo: ${it.quantity}`;
        }),
      ];

      const title = `PREVIEW – admin email objednávky #${order.id}`;
      const heading =
        type === 'paid'
          ? `Nová objednávka #${order.id} - platba prijatá`
          : `Nová objednávka #${order.id} - nekartová platba`;

      const cta = FRONTEND_URL
        ? {
            label: 'Zobraziť objednávku (FE)',
            href: `${FRONTEND_URL.replace(/\/$/, '')}/checkout/success?order=${order.id}`,
          }
        : undefined;

      let html = renderOrderEmail({
        title,
        heading,
        introLines: adminIntroLines,
        cta: cta ?? null,
        items: emailItems,
        shippingFee,
        paymentFee,
        totalWithShipping,
        deliverySummary,
        orderNotes,
        billingHtml
      });

      if (doCheck) {
        const rows = diagnostics.map(d => `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;">${d.name}</td>
          <td style="padding:6px;border:1px solid #ddd;">${d.rawFrom}</td>
          <td style="padding:6px;border:1px solid #ddd;word-break:break-all;">${d.rawUrl || '-'}</td>
          <td style="padding:6px;border:1px solid #ddd;word-break:break-all;">${d.resolvedUrl || '-'}</td>
          <td style="padding:6px;border:1px solid #ddd;">${d.headOk === undefined ? '-' : (d.headOk ? 'OK' : 'FAIL')}</td>
          <td style="padding:6px;border:1px solid #ddd;">${d.headStatus ?? '-'}</td>
          <td style="padding:6px;border:1px solid #ddd;">${d.note || ''}</td>
        </tr>
      `).join('');

        const diagBlock = `
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <div style="font-family:Arial,sans-serif;">
          <h3 style="margin:0 0 8px 0;">Diagnostika obrázkov (preview)</h3>
          <p style="margin:0 0 12px 0;font-size:13px;color:#555;">
            Parametre: <code>check=${doCheck ? '1' : '0'}</code>, <code>source=${source}</code>.<br>
            Ak je <strong>HEAD FAIL</strong>, skontroluj <code>PUBLIC_UPLOADS_URL</code> / <code>UPLOADS_BASE_URL</code>
            a či súbor existuje na ceste.
          </p>
          <table style="border-collapse:collapse;font-size:13px;">
            <thead>
              <tr>
                <th style="text-align:left;padding:6px;border:1px solid #ddd;">Item</th>
                <th style="text-align:left;padding:6px;border:1px solid #ddd;">Zdroj</th>
                <th style="text-align:left;padding:6px;border:1px solid #ddd;">Raw URL</th>
                <th style="text-align:left;padding:6px;border:1px solid #ddd;">Resolved URL</th>
                <th style="text-align:left;padding:6px;border:1px solid #ddd;">HEAD</th>
                <th style="text-align:left;padding:6px;border:1px solid #ddd;">Status</th>
                <th style="text-align:left;padding:6px;border:1px solid #ddd;">Pozn.</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
        html = html.replace(/<\/html>\s*$/i, `${diagBlock}\n</html>`);
      }

      ctx.type = 'text/html; charset=utf-8';
      ctx.body = html;
    } catch (e: any) {
      strapi.log.error('[PAYMENTS][PREVIEW EMAIL] error:', e?.message || e);
      ctx.throw(500, 'Preview failed');
    }
  },

  // 2) Webhook (push)
  async webhook(ctx: any) {
    strapi.log.info(`[COMGATE][WEBHOOK][IN] body=${redact(ctx.request.body)}`);

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

    const transId = (data as any).transId || (data as any).id;
    const refId = (data as any).refId;

    if (!transId) {
      strapi.log.error('[COMGATE][WEBHOOK] missing transId');
      ctx.status = 400; ctx.body = 'Bad Request'; return;
    }

    const status = await comgateStatus(String(transId));
    if (String((status as any).code) !== '0') {
      strapi.log.error('[COMGATE][STATUS] code!=0', sanitizeComgateRaw(status));
      ctx.status = 200; ctx.body = 'OK'; return;
    }

    let order: OrderRecord | null = null;
    try {
      order = (await strapi.db.query('api::order.order').findOne({
        where: { comgateTransId: String(transId) },
        select: ['id','paymentStatus','comgateTransId','orderStatus','fulfillmentStatus'],
      })) as any;

      if (!order && refId) {
        order = (await strapi.db.query('api::order.order').findOne({
          where: { id: Number(refId) },
          select: ['id','paymentStatus','comgateTransId','orderStatus','fulfillmentStatus'],
        })) as any;
      }
    } catch (e) {
      strapi.log.error('[COMGATE][WEBHOOK] order lookup error:', e);
    }

    if (!order) {
      strapi.log.error(`[COMGATE][WEBHOOK] No order found for transId=${transId}, refId=${refId || '-'}`);
      ctx.status = 200; ctx.body = 'OK'; return;
    }

    const statusRefId = Number((status as any).refId || (status as any).refID || (status as any).reference || 0);
    const statusCurr = String((status as any).curr || (status as any).currency || '').toUpperCase();
    const statusPrice = Number((status as any).price || (status as any).amount || 0);

    const { expectedCents } = await getOrderAndExpectedCents(order.id);

    if (statusRefId && statusRefId !== order.id) { ctx.status = 200; ctx.body = 'OK'; return; }
    if (statusCurr && statusCurr !== 'EUR') { ctx.status = 200; ctx.body = 'OK'; return; }
    if (statusPrice && Math.abs(statusPrice - expectedCents) > 1) { ctx.status = 200; ctx.body = 'OK'; return; }

    // CANCELLED-like — označ a skonči
    if (isCancelledLike((status as any).status)) {
      try {
        await strapi.db.query('api::order.order').update({
          where: { id: order.id },
          data: { orderStatus: 'cancelled', fulfillmentStatus: 'cancelled', paymentStatus: 'unpaid', comgateTransId: String(transId) },
        });
        strapi.log.info(`[COMGATE][ORDER] #${order.id} -> cancelled (webhook)`);
      } catch (e) {
        strapi.log.error(`[COMGATE][ORDER CANCEL][WEBHOOK] failed #${order.id}:`, e);
      }
      ctx.status = 200; ctx.body = 'OK'; return;
    }

    const mapped = mapComgateToOrder(String((status as any).status || ''));
    const prev: PaymentStatus | null = (order.paymentStatus ?? null) as PaymentStatus | null;
    let next: PaymentStatus = prev ?? 'unpaid';

    if (mapped === 'paid' && prev !== 'paid') next = 'paid';
    else if (mapped === 'refunded' && prev !== 'refunded') next = 'refunded';
    else if (mapped === 'unpaid' && (!prev || prev === 'unpaid')) next = 'unpaid';

    const needStatusChange = next !== prev;
    const needTransPersist = order.comgateTransId !== String(transId);

    if (needStatusChange || needTransPersist) {
      try {
        await strapi.db.query('api::order.order').update({
          where: { id: order.id },
          data: { paymentStatus: next, comgateTransId: String(transId) },
        });
      } catch (e) {
        strapi.log.error('[COMGATE][ORDER UPDATE] error:', e);
      }
    }

    if (next === 'paid' && prev !== 'paid') {
      try { await runPostPaidFlow(order.id); } catch (e) { strapi.log.error('[COMGATE][WEBHOOK][AFTER-PAID] error:', e); }
    }

    ctx.status = 200; ctx.body = 'OK';
  },

  // 3) FE status/polling
  async status(ctx: any) {
    const { transId, orderId } = ctx.request.body || {};
    let t: string | null = transId || null;
    let ord: { id: number; paymentStatus?: PaymentStatus | null } | null = null;

    if (!t && orderId) {
      const o = await strapi.db.query('api::order.order').findOne({
        where: { id: Number(orderId) },
        select: ['id','comgateTransId','paymentStatus'],
      });
      ord = o as any;
      t = (o as any)?.comgateTransId || null;
      if (!t) {
        return ctx.send({ ok: true, transId: null, paymentStatus: ((o as any)?.paymentStatus as PaymentStatus) || 'unpaid', source: 'db' });
      }
    }

    if (!t) return ctx.badRequest('transId or orderId is required');

    const s = await comgateStatus(String(t));
    const comgateRawSafe = sanitizeComgateRaw(s);

    if (String((s as any).code) !== '0') {
      return ctx.send({ ok: true, transId: t, comgateRaw: comgateRawSafe, paymentStatus: ord?.paymentStatus || 'unpaid', source: 'comgate' });
    }

    const o2 = await strapi.db.query('api::order.order').findOne({
      where: { comgateTransId: String(t) },
      select: ['id','paymentStatus','orderStatus','fulfillmentStatus'],
    }) as any;
    if (!o2) {
      return ctx.send({ ok: true, transId: t, comgateRaw: comgateRawSafe, paymentStatus: 'unpaid', source: 'comgate' });
    }

    const statusRefId = Number((s as any).refId || (s as any).refID || (s as any).reference || 0);
    const statusCurr = String((s as any).curr || (s as any).currency || '').toUpperCase();
    const statusPrice = Number((s as any).price || (s as any).amount || 0);

    const { expectedCents } = await getOrderAndExpectedCents(o2.id);
    if ((statusRefId && statusRefId !== o2.id) || (statusCurr && statusCurr !== 'EUR') || (statusPrice && Math.abs(statusPrice - expectedCents) > 1)) {
      return ctx.send({
        ok: true, transId: t, comgateRaw: comgateRawSafe,
        paymentStatus: (o2.paymentStatus as PaymentStatus) || 'unpaid',
        source: 'comgate', note: 'guard_mismatch',
      });
    }

    if (isCancelledLike((s as any).status)) {
      try { await markOrderCancelled(o2.id); } catch (e) { strapi.log.error(`[COMGATE][ORDER CANCEL][STATUS] failed #${o2.id}:`, e); }
      return ctx.send({
        ok: true, transId: t, comgateRaw: comgateRawSafe,
        paymentStatus: (o2.paymentStatus as PaymentStatus) || 'unpaid',
        source: 'comgate', orderStatus: 'cancelled',
      });
    }

    const normalized = mapComgateToOrder(String((s as any).status || ''));
    const prev = (o2.paymentStatus as PaymentStatus | null) ?? 'unpaid';

    if (prev !== normalized) {
      await strapi.db.query('api::order.order').update({ where: { id: o2.id }, data: { paymentStatus: normalized } });
      if (normalized === 'paid' && prev !== 'paid') {
        try { await runPostPaidFlow(o2.id); } catch (e) { strapi.log.error('[COMGATE][STATUS][AFTER-PAID] error:', e); }
      }
    }

    ctx.send({ ok: true, transId: t, comgateRaw: comgateRawSafe, paymentStatus: normalized, source: 'comgate' });
  },

  // 4) Bridge endpoint pre Comgate redirecty (PAID/CANCELLED/PENDING) -> aktualizuje DB a presmeruje FE
  async returnBridge(ctx: any) {
    try {
      const q: any = ctx.query || {};
      const FRONTEND = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
      const to = {
        pending:   (id: number) => (FRONTEND ? `${FRONTEND}/checkout/success?order=${id}`   : `/checkout/success?order=${id}`),
        success:   (id: number) => (FRONTEND ? `${FRONTEND}/checkout/success?order=${id}`   : `/checkout/success?order=${id}`),
        cancelled: (id: number) => (FRONTEND ? `${FRONTEND}/checkout/cancelled?order=${id}` : `/checkout/cancelled?order=${id}`),
        fallback:  ()            => (FRONTEND ? `${FRONTEND}/checkout`                      : `/checkout`),
      };
      const redirect = (loc: string) => { strapi.log.info(`[COMGATE][RETURN] 302 -> ${loc}`); ctx.status = 302; ctx.redirect(loc); };

      const statusParam = String(q.status || q.state || '').toUpperCase();
      let transId: string | null =
        (q.transId || q.transID || q.transactionId || q.id)
          ? String(q.transId || q.transID || q.transactionId || q.id)
          : null;
      const refIdQ: number | null =
        Number(q.refId || q.refID || q.reference || q.order || q.orderId || 0) || null;

      if (!transId) {
        const ref = String(ctx.request.headers['referer'] || '');
        const m = ref.match(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/i);
        if (m) transId = m[0];
        if (transId) strapi.log.info(`[COMGATE][RETURN] transId from Referer: ${transId}`);
      }

      if (statusParam === 'PENDING' && refIdQ) return redirect(to.pending(refIdQ));

      let order: OrderRecord | null = null;
      if (transId) {
        order = await strapi.db.query('api::order.order').findOne({
          where: { comgateTransId: String(transId) },
          select: ['id','paymentStatus','orderStatus','fulfillmentStatus','comgateTransId','updatedAt'],
        }) as any;
      }
      if (!order && refIdQ) {
        order = await strapi.db.query('api::order.order').findOne({
          where: { id: Number(refIdQ) },
          select: ['id','paymentStatus','orderStatus','fulfillmentStatus','comgateTransId','updatedAt'],
        }) as any;
      }

      if (!order) {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const recent = await strapi.db.query('api::order.order').findMany({
          where: { comgateTransId: { $notNull: true }, updatedAt: { $gt: fiveMinAgo } },
          select: ['id','paymentStatus','orderStatus','fulfillmentStatus','comgateTransId','updatedAt'],
          orderBy: { updatedAt: 'desc' } as any,
          limit: 1,
        }) as any[];
        if (recent && recent[0]) {
          order = recent[0] as any;
          if (!transId && order!.comgateTransId) transId = String(order!.comgateTransId);
          strapi.log.warn(`[COMGATE][RETURN] using recent order fallback #${order!.id}`);
        }
      }

      if (!order && !refIdQ) return redirect(to.fallback());
      if (!order && refIdQ) return redirect(to.pending(refIdQ));

      if (!transId && order!.comgateTransId) transId = String(order!.comgateTransId);

      if (['CANCELLED','CANCELED','REJECTED','TIMEOUT','EXPIRED'].includes(statusParam)) {
        try {
          await strapi.db.query('api::order.order').update({
            where: { id: order!.id },
            data: { orderStatus: 'cancelled', fulfillmentStatus: 'cancelled', paymentStatus: 'unpaid' },
          });
        } catch (e) { strapi.log.error(`[COMGATE][RETURN][CANCEL immediate] #${order!.id}:`, e); }
        return redirect(to.cancelled(order!.id));
      }

      if (!transId) return redirect(to.pending(order!.id));

      const s = await comgateStatus(String(transId));

      if (isCancelledLike((s as any).status)) {
        try {
          await strapi.db.query('api::order.order').update({
            where: { id: order!.id },
            data: { orderStatus: 'cancelled', fulfillmentStatus: 'cancelled', paymentStatus: 'unpaid' },
          });
        } catch (e) { strapi.log.error(`[COMGATE][RETURN][CANCEL] #${order!.id}:`, e); }
        return redirect(to.cancelled(order!.id));
      }

      if (String((s as any).code) !== '0') return redirect(to.pending(order!.id));

      const { expectedCents } = await getOrderAndExpectedCents(order!.id);
      const statusRefId = Number((s as any).refId || (s as any).refID || (s as any).reference || 0);
      const statusCurr  = String((s as any).curr || (s as any).currency || '').toUpperCase();
      const statusPrice = Number((s as any).price || (s as any).amount || 0);

      if ((statusRefId && statusRefId !== order!.id) ||
          (statusCurr && statusCurr !== 'EUR') ||
          (statusPrice && Math.abs(statusPrice - expectedCents) > 1)) {
        return redirect(to.pending(order!.id));
      }

      const normalized = mapComgateToOrder(String((s as any).status || ''));
      if (normalized === 'paid') {
        try {
          const prev = order!.paymentStatus || 'unpaid';
          if (prev !== 'paid') {
            await strapi.db.query('api::order.order').update({
              where: { id: order!.id },
              data: { paymentStatus: 'paid' },
            });
            await runPostPaidFlow(order!.id);
          }
        } catch (e) { strapi.log.error('[COMGATE][RETURN][PAID] update/send:', e); }
        return redirect(to.success(order!.id));
      }

      return redirect(to.pending(order!.id));
    } catch (e: any) {
      strapi.log.error('[COMGATE][RETURN] error:', e?.message || e);
      ctx.status = 500; ctx.body = 'Internal error';
    }
  }
};
