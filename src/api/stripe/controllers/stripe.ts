import Stripe from 'stripe';
import { sendEmail } from '../../../utils/email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

/* ========================= Helpery pre email ========================= */

// Absolutizácia URL pre obrázky z Upload pluginu (ak vracia relatívne cesty)
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

// Výber hlavného obrázka produktu podľa tvojho schema.json:
// single media: picture_new; multiple media: pictures_new[]
function pickProductImage(product: any): string {
  const single = product?.picture_new;
  const firstMulti = Array.isArray(product?.pictures_new) ? product.pictures_new[0] : null;
  const media = single || firstMulti || null;

  // Strapi Upload má formáty: thumbnail, small, medium, large
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

// HTML riadky položiek objednávky
function renderItemsRows(items: Array<{ productName: string; unitPrice: number; quantity: number; image?: string }>) {
  return items
    .map((it) => {
      const subtotal = it.unitPrice * it.quantity;
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${it.image ? `<img src="${it.image}" alt="" width="64" height="64" style="object-fit:cover;border-radius:4px;" />` : ''}
              <div>
                <div style="font-weight:600;color:#333;">${it.productName}</div>
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

// Kompletný email podľa tvojej šablóny so zhrnutím objednávky
function renderOrderEmail(opts: {
  title: string;
  heading: string;
  introLines: string[];
  cta?: { label: string; href: string } | null;
  items: Array<{ productName: string; unitPrice: number; quantity: number; image?: string }>;
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
    .container {
      max-width: 600px; margin: 40px auto; background: #fff url('https://staging.d2y68xwoabt006.amplifyapp.com/assets/img/corner6.png') no-repeat right bottom;
      background-size: 200px auto; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.05); overflow: hidden;
    }
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
      ${
        opts.cta
          ? `<p style="text-align:center;"><a class="button" href="${opts.cta.href}">${opts.cta.label}</a></p>`
          : ''
      }

      <h3 style="color:#333;margin-top:32px;">Zhrnutie objednávky</h3>
      <p style="font-size:14px;color:#666;margin:6px 0;"><b>Doručenie:</b> ${opts.deliverySummary}</p>

      <table role="presentation" aria-hidden="true" style="margin-top:8px;">
        <thead>
          <tr>
            <th>Položka</th>
            <th style="text-align:right;">Spolu</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
          <tr>
            <td style="padding:8px 12px;border-top:2px solid #eee;color:#333;">Doprava</td>
            <td align="right" style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${money(opts.shippingFee)}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-top:1px solid #eee;font-weight:700;color:#111;">Celkom</td>
            <td align="right" style="padding:10px 12px;border-top:1px solid #eee;font-weight:700;color:#111;">${money(opts.totalWithShipping)}</td>
          </tr>
        </tbody>
      </table>

      <p style="font-size:13px;color:#666;margin-top:16px;">
        Ak máte otázky k objednávke, odpovedzte na tento e-mail.
      </p>
    </div>

    <div class="footer">
      <p>
        Slovenská ľudová majolika<br>
        Dolná 138, 900 01 Modra<br>
        IČO: 00 167 975 | DIČ: 2020360155<br>
        IBAN: SK97 0900 0000 0051 3558 7112 (SLSP)<br>
        <a href="mailto:majolika@majolika.sk">majolika@majolika.sk</a> |
        <a href="mailto:info@majolika.sk">info@majolika.sk</a><br>
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

/* ========================= Typy ========================= */

type DeliveryMethod = 'pickup' | 'post_office' | 'packeta_box' | 'post_courier';

type OrderItem = {
  productId: number;
  productName?: string;
  quantity: number;
  unitPrice: number;
};

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
};

/* ========================= Sumarizácia doručenia ========================= */

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

/* ========================= Controller ========================= */

export default {
  async ping(ctx) {
    strapi.log.info('[WEBHOOK] ping ok');
    return ctx.send({ ok: true });
  },

  async webhook(ctx) {
    // POZOR: vyžaduje config/middlewares.ts s includeUnparsed: true
    const rawBody = ctx.request.body?.[Symbol.for('unparsedBody') as any];
    const sig = ctx.request.headers['stripe-signature'] as string | undefined;

    if (!rawBody || !sig) {
      strapi.log.error('❌ Missing webhook signature or body');
      return ctx.badRequest('Missing webhook signature or body');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
      strapi.log.info(`✅ Received event: ${event.type}`);
    } catch (err: any) {
      strapi.log.error(`🔴 Webhook signature failed: ${err.message}`);
      return ctx.badRequest(err.message);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      // 1) Nájdi order – metadata.orderId / client_reference_id / paymentSessionId / payment_intent
      const metaOrderId = session.metadata?.orderId || session.client_reference_id;
      let order: OrderRecord | null = null;

      if (metaOrderId) {
        order = (await strapi.db.query('api::order.order').findOne({
          where: { id: Number(metaOrderId) },
        })) as unknown as OrderRecord | null;
      }
      if (!order) {
        order = (await strapi.db.query('api::order.order').findOne({
          where: { paymentSessionId: session.id },
        })) as unknown as OrderRecord | null;
      }
      if (!order && session.payment_intent) {
        order = (await strapi.db.query('api::order.order').findOne({
          where: { paymentIntentId: String(session.payment_intent) },
        })) as unknown as OrderRecord | null;
      }
      if (!order) {
        strapi.log.error(`❌ No order found for session ${session.id} (metaOrderId=${metaOrderId || 'none'})`);
        return ctx.send({ received: true, order: null });
      }

      // 2) Doplň temporaryId z metadata, ak chýba
      if (!order.temporaryId && session.metadata?.temporaryId) {
        await strapi.db.query('api::order.order').update({
          where: { id: order.id },
          data: { temporaryId: session.metadata.temporaryId },
        });
        order.temporaryId = session.metadata.temporaryId;
        strapi.log.info(`[PATCH] temporaryId doplnený z metadata: ${order.temporaryId}`);
      }

      // 3) Nastav paymentStatus na 'paid'
      await strapi.db.query('api::order.order').update({
        where: { id: order.id },
        data: { paymentStatus: 'paid' },
      });
      strapi.log.info(`✅ Updated order #${order.id} to paid`);

      // 4) Aktualizuj bookingy (tvoj existujúci flow)
      if (order.temporaryId) {
        const res = await strapi.db.query('api::event-booking.event-booking').updateMany({
          where: { temporaryId: order.temporaryId, orderId: null },
          data: { orderId: String(order.id), status: 'paid' },
        });
        strapi.log.info(`✅ Updated ${res.count} bookings (temporaryId=${order.temporaryId}) → orderId=${order.id}, status=paid`);
      } else {
        strapi.log.warn('⚠️ No temporaryId found for this order/session, skipping temporaryId bookings update.');
      }

      const res2 = await strapi.db.query('api::event-booking.event-booking').updateMany({
        where: { orderId: String(order.id) },
        data: { status: 'paid' },
      });
      strapi.log.info(`✅ Updated ${res2.count} bookings to paid for orderId ${order.id}`);

      // 5) Pošli e-maily po úspešnej úhrade (so šablónou vrátane položiek a obrázkov)
      const FRONTEND_URL = process.env.FRONTEND_URL || '';
      const freshOrder = (await strapi.entityService.findOne('api::order.order', order.id, {
        populate: ['deliveryAddress', 'deliveryDetails', 'items'],
      })) as unknown as OrderRecord;

      const to = session.metadata?.customerEmail || freshOrder.customerEmail;
      const deliverySummary = summarizeDeliveryFromOrder(freshOrder);
      const shippingFee = Number(freshOrder.shippingFee || 0);
      const totalWithShipping = Number(freshOrder.totalWithShipping || freshOrder.total || 0);

      // Dotiahni obrázky pre položky na základe productId
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
          };
        })
      );

      const customerEmailHtml = renderOrderEmail({
        title: 'Potvrdenie objednávky – platba prijatá',
        heading: 'Ďakujeme, platba prijatá',
        introLines: [
          `Dobrý deň${freshOrder.customerName ? `, ${freshOrder.customerName}` : ''}.`,
          `Platba za vašu objednávku #${order.id} prebehla úspešne.`,
        ],
        cta: FRONTEND_URL
          ? {
              label: 'Zobraziť objednávku',
              href: `${FRONTEND_URL.replace(/\/$/, '')}/checkout/success?order=${order.id}`,
            }
          : null,
        items: emailItems,
        shippingFee,
        totalWithShipping,
        deliverySummary,
      });

      const adminEmailHtml = renderOrderEmail({
        title: `Nová objednávka #${order.id} – zaplatené`,
        heading: `Nová objednávka #${order.id} – platba prijatá`,
        introLines: [
          `Zákazník: ${freshOrder.customerName || '-'} (${to || freshOrder.customerEmail || '-'})`,
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
          await sendEmail({
            to,
            subject: 'Potvrdenie objednávky – platba prijatá',
            html: customerEmailHtml,
          });
        } else {
          strapi.log.warn(`[EMAIL] Chýba zákaznícky e-mail pri objednávke #${order.id}`);
        }

        await sendEmail({
          to: 'info@appdesign.sk',
          subject: `Nová objednávka #${order.id} – zaplatené`,
          html: adminEmailHtml,
        });
      } catch (e) {
        strapi.log.error('[STRIPE][WEBHOOK][EMAIL] error:', e);
      }

      // 6) (VOLITEĽNÉ) Packeta po úhrade – ostáva rovnaké, len typy
      try {
        const autoCreate = String(process.env.PACKETA_AUTO_CREATE_ON_PAID || '').toLowerCase() === 'true';
        if (
          autoCreate &&
          freshOrder?.deliveryMethod === 'packeta_box' &&
          freshOrder?.deliveryDetails?.packetaBoxId
        ) {
          strapi.log.info('[PACKETA][AUTO] Creating shipment for order #' + order.id);
          const result = await strapi.service('api::packeta.packeta').createShipmentFromOrder(freshOrder);

          try {
            await strapi.db.query('api::order.order').update({
              where: { id: order.id },
              data: {
                // shipmentId: result?.shipmentId || null,
                // trackingNumber: result?.trackingNumber || null,
                // labelUrl: result?.labelUrl || null,
              },
            });
          } catch (e) {
            strapi.log.info('[PACKETA][AUTO] Shipment created (not persisted in order): ' + JSON.stringify(result));
          }
        }
      } catch (e: any) {
        strapi.log.error('[PACKETA][AUTO] createShipment failed:', e?.message || e);
      }

      return ctx.send({ received: true });
    }

    // Iné eventy – len ACK
    return ctx.send({ received: true });
  },
};
