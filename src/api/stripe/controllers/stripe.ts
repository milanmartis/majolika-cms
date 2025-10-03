// src/api/payment/controllers/payment.ts
import qs from 'qs';
import fetch from 'node-fetch';
import { sendEmail } from '../../../utils/email';

// ========================= Comgate ENV =========================
const API = process.env.COMGATE_API || 'https://payments.comgate.cz/v1.0';
const MERCHANT = process.env.COMGATE_MERCHANT!;
const SECRET = process.env.COMGATE_SECRET!;
const TEST = String(process.env.COMGATE_TEST || 'false') === 'true';

// ========================= Tvoje typy =========================
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
  // odporúčané polia pre matching:
  comgateTransId?: string | null; // uložte pri create()
};

// ========================= Helpery pre email a render =========================

// Absolutizácia URL pre obrázky
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
        ? `<div style="font-size:13px;color:#0e29a0;padding:4px 4px 0 4px;">${formatEventSk(it.event!)}</div>`
        : '';
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${it.image ? `<img src="${it.image}" alt="" width="64" height="64" style="object-fit:cover;border-radius:4px;" />` : '<img src="https://staging.d2y68xwoabt006.amplifyapp.com/assets/img/logo-SLM-modre.gif" alt="" width="64" height="64" style="object-fit:cover;border-radius:4px;" />'}
              <div>
                <div style="font-weight:600;color:#333;">${it.productName}</div>
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
  <title>${opts.title}</title>
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
      <h2>${opts.heading}</h2>
      ${opts.introLines.map((t) => `<p>${t}</p>`).join('')}
      ${opts.cta ? `<p style="text-align:center;"><a class="button" href="${opts.cta.href}">${opts.cta.label}</a></p>` : ''}

      <h3 style="color:#333;margin-top:32px;">Zhrnutie objednávky</h3>
      <p style="font-size:14px;color:#666;margin:6px 0;"><b>Doručenie:</b> ${opts.deliverySummary}</p>

      <table role="presentation" aria-hidden="true" style="margin-top:8px;">
        <thead><tr><th>Položka</th><th style="text-align:right;">Spolu</th></tr></thead>
        <tbody>
          ${itemsRows}
          <tr><td style="padding:8px 12px;border-top:2px solid #eee;color:#333;">Doprava</td>
              <td align="right" style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${money(opts.shippingFee)}</td></tr>
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
function safe(o: any) {
  try { return JSON.stringify(o); } catch { return String(o); }
}
// Sumarizácia doručenia
function summarizeDeliveryFromOrder(order: OrderRecord | any): string {
  switch (order?.deliveryMethod) {
    case 'pickup': return 'Osobné vyzdvihnutie na mieste';
    case 'post_office': return `Na poštu (ID: ${order?.deliveryDetails?.postOfficeId || '-'})`;
    case 'packeta_box':
      return order?.deliveryDetails?.notes
        ? `Packeta/Carrier box: ${order.deliveryDetails.notes}`
        : `Packeta Box (ID: ${order?.deliveryDetails?.packetaBoxId || '-'})`;
    case 'post_courier': {
      const a = order?.deliveryAddress || {};
      return `Kuriér na adresu: ${a.street}, ${a.city} ${a.zip}, ${a.country}`;
    }
    default: return String(order?.deliveryMethod || '');
  }
}

// ========================= Pomocné Comgate funkcie =========================

async function comgateStatus(transId: string) {
  const body = qs.stringify({ merchant: MERCHANT, transId, secret: SECRET });
  const res = await fetch(`${API}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/x-www-form-urlencoded' },
    body,
  });
  const txt = await res.text();
  const parsed = Object.fromEntries(new URLSearchParams(txt));

   // LOG: odpoveď Comgate
   strapi.log.info(`[COMGATE][CREATE][OUT] code=${parsed.code} transId=${parsed.transId} raw=${safe(parsed)}`);


  return parsed as any; // očakávame { code, message, transId, status, ... }
}

function clampLabel(s: string | undefined, def = 'Order') {
  const v = (s || def).trim();
  return v.length <= 16 ? v : v.slice(0, 16);
}

// ========================= Controller =========================
export default {
  async ping(ctx) {
    strapi.log.info('[COMGATE] ping ok');
    return ctx.send({ ok: true });
  },

  // 1) Založenie platby (server-side) -> FE dostane redirect URL
  async create(ctx) {

    const { amountCents, currency = 'EUR', orderId, email, phone, fullName, country = 'SK', label = 'Order' } = ctx.request.body;

    if (!MERCHANT || !SECRET) ctx.throw(500, 'Comgate not configured');
    if (!amountCents || !orderId || !email || !fullName) ctx.throw(400, 'Missing required fields');

      // LOG: vstup
  strapi.log.info(`[COMGATE][CREATE][IN] body=${safe(ctx.request.body)}`);

    const body = qs.stringify({
      merchant: MERCHANT,
      test: TEST ? 'true' : 'false',
      country,
      price: amountCents,      // v centoch
      curr: currency,
      label: clampLabel(label),
      refId: String(orderId),  // tvoja interná objednávka
      method: 'ALL',
      email,
      phone,
      fullName,
      prepareOnly: 'true',     // vracia transId + redirect (bez okamžitého presmerovania)
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

    if (parsed.code !== '0') {
      strapi.log.error('[COMGATE][CREATE] error:', parsed);
      ctx.throw(400, parsed.message || 'Comgate create error');
    }

    // ulož transId k objednávke (odporúčané)
    try {
      await strapi.db.query('api::order.order').update({
        where: { id: Number(orderId) },
        data: { comgateTransId: parsed.transId, paymentStatus: 'unpaid' },
      });
    } catch (e) {
      strapi.log.warn(`[COMGATE][CREATE] could not persist transId for order ${orderId}: ${String(e)}`);
    }

    ctx.body = {
      transId: parsed.transId,
      paymentUrl: decodeURIComponent(parsed.redirect),
      message: parsed.message,
    };
  },

  // 2) Webhook (Url pro předání výsledku platby) – Comgate -> náš server
  async webhook(ctx) {
    // Comgate posiela buď x-www-form-urlencoded (v1.0) alebo JSON (v2.0)
    let data: any = {};
    try {
      if (typeof ctx.request.body === 'string') {
        data = Object.fromEntries(new URLSearchParams(ctx.request.body));
      } else if (ctx.request.is('application/x-www-form-urlencoded')) {
        data = ctx.request.body;
      } else {
        data = ctx.request.body || {};
      }
    } catch {
      data = {};
    }

    const transId = data.transId || data.id;
    const refId = data.refId;

    if (!transId) {
      strapi.log.error('[COMGATE][WEBHOOK] missing transId');
      ctx.status = 400;
      ctx.body = 'Bad Request';
      return;
    }

    // Bezpečnost: vždy overiť skutočný stav na Comgate
    const status = await comgateStatus(transId);
    const code = status.code;
    const st = (status.status || '').toUpperCase();

    strapi.log.info(`[COMGATE][DBG] status.raw=${JSON.stringify(status)}`);
// výsledná hodnota do DB

    if (code !== '0') {
      strapi.log.error('[COMGATE][STATUS] code!=0', status);
      // aj pri chybe statusu potvrď 200, Comgate aj tak spraví retry pushu
      ctx.status = 200;
      ctx.body = 'OK';
      return;
    }

    // Nájdeme objednávku: preferuj uložené transId, fallback refId (tvoj orderId)
    let order: OrderRecord | null = null;
    try {
      order = (await strapi.db.query('api::order.order').findOne({
        where: { comgateTransId: String(transId) },
      })) as unknown as OrderRecord | null;

      if (!order && refId) {
        order = (await strapi.db.query('api::order.order').findOne({
          where: { id: Number(refId) },
        })) as unknown as OrderRecord | null;
      }
    } catch (e) {
      strapi.log.error('[COMGATE][WEBHOOK] order lookup error:', e);
    }

    if (!order) {
      strapi.log.error(`[COMGATE][WEBHOOK] No order found for transId=${transId}, refId=${refId || '-'}`);
      ctx.status = 200;
      ctx.body = 'OK';
      return;
    }

    // Mapovanie stavov
    let newPaymentStatus: string | null = null;
    if (st === 'PAID') newPaymentStatus = 'paid';
    else if (st === 'CANCELLED') newPaymentStatus = 'cancelled';
    else if (st === 'AUTHORIZED') newPaymentStatus = 'authorized';
    else if (st === 'PENDING') newPaymentStatus = 'pending';

    if (newPaymentStatus) {
      try {
        await strapi.db.query('api::order.order').update({
          where: { id: order.id },
          data: { paymentStatus: newPaymentStatus, comgateTransId: String(transId) },
        });
        strapi.log.info(`[COMGATE][ORDER] #${order.id} -> ${newPaymentStatus}`);
      } catch (e) {
        strapi.log.error('[COMGATE][ORDER UPDATE] error:', e);
      }
    }

    strapi.log.info(`[COMGATE][DBG] will-set paymentStatus=${newPaymentStatus}`);


    // Ak je zaplatené -> rovnaký flow ako u Stripe
    if (st === 'PAID') {
      // Bookingy viazané na temporaryId
      try {
        const freshOrder = (await strapi.entityService.findOne('api::order.order', order.id, {
          populate: ['deliveryAddress', 'deliveryDetails', 'items'],
        })) as unknown as OrderRecord;

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

        // Email notifikácie
        const FRONTEND_URL = process.env.FRONTEND_URL || '';
        const to = freshOrder.customerEmail;
        const deliverySummary = summarizeDeliveryFromOrder(freshOrder);
        const shippingFee = Number(freshOrder.shippingFee || 0);
        const totalWithShipping = Number(freshOrder.totalWithShipping || freshOrder.total || 0);

        // Obrázky položiek
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
          } else {
            strapi.log.warn(`[EMAIL] Chýba zákaznícky e-mail pri objednávke #${freshOrder.id}`);
          }
          await sendEmail({ to: 'info@appdesign.sk', subject: `Nová objednávka #${freshOrder.id} – zaplatené`, html: adminEmailHtml });
        } catch (e) {
          strapi.log.error('[COMGATE][WEBHOOK][EMAIL] error:', e);
        }

        // (VOLITEĽNÉ) Packeta po úhrade
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
      } catch (e) {
        strapi.log.error('[COMGATE][WEBHOOK][AFTER-PAID] error:', e);
      }
    }

    // ACK pre Comgate (nutné vrátiť 2xx)
    ctx.status = 200;
    ctx.body = 'OK';
  },

  // 3) (voliteľné) manuálne overenie z FE (po návrate z redirectu)
  async status(ctx) {
    const { transId } = ctx.request.body || {};
    if (!transId) return ctx.badRequest('transId is required');
    const s = await comgateStatus(String(transId));
    ctx.body = s;
  },
  
};
