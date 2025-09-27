'use strict';
import { sendEmail } from '../../../utils/email';

/* ========================= Helpery ========================= */
// + pridaj toto nad CheckoutItem
interface EventInfo {
  sessionId?: number;
  type?: 'workshop' | 'tour' | string; // prehliadka = 'tour' alebo nechávam string
  startDateTime?: string;              // ISO v UTC
  peopleCount?: number;
  bookingId?: number;
}

// uprav CheckoutItem
interface CheckoutItem {
  productId: number;
  productName?: string;
  quantity: number;
  unitPrice: number;
  event?: EventInfo; // <— PRIDANÉ
}

function formatEvent(event?: EventInfo): string {
  if (!event?.startDateTime) return '';
  // Europe/Bratislava
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

  const people = typeof event.peopleCount === 'number' ? ` • Osoby: ${event.peopleCount}` : '';
  return `Termín: ${d}, ${t}${people}`;
}

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
function renderItemsRows(items: Array<{ 
  productName: string; 
  unitPrice: number; 
  quantity: number; 
  image?: string; 
  event?: EventInfo; // <— PRIDANÉ
}>) {
  return items
    .map((it) => {
      const subtotal = it.unitPrice * it.quantity;
      const eventLine = it.event?.startDateTime ? `
        <div style="font-size:13px;color:#0e29a0;padding:4px 4px 0 4px;">
          ${formatEvent(it.event)}
        </div>` : '';
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${it.image ? `<img src="${it.image}" alt="" width="64" height="64" style="object-fit:cover;border-radius:4px;" />` : '<img src="https://staging.d2y68xwoabt006.amplifyapp.com/assets/img/logo-SLM-modre.gif" alt="" width="64" height="64" style="object-fit:cover;border-radius:4px;" />'}
              <div>
                <div style="font-weight:600;color:#333;padding:4px;">${it.productName}</div>
                ${eventLine}
                <div style="font-size:13px;color:#777;padding:4px;">${money(it.unitPrice)} × ${it.quantity}</div>
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

type PaymentMethod = 'card' | 'cod' | 'bank' | 'onsite' | 'post';
type DeliveryMethod = 'pickup' | 'post_office' | 'packeta_box' | 'post_courier';

interface Address {
  street: string;
  city: string;
  zip: string;
  country: string;
}

interface DeliveryDetails {
  provider?: string;         // 'packeta' alebo 'carrier:<id>'
  postOfficeId?: string;     // Slovenská pošta
  packetaBoxId?: string;     // Packeta/Carrier PUDO ID
  notes?: string;            // sumár z widgetu
}

interface Delivery {
  method: DeliveryMethod;
  address?: Address | null;     // pre kuriéra
  details?: DeliveryDetails | null;
}

interface CheckoutPayload {
  customer: {
    id?: number;
    name: string;
    email: string;
    phone: string;
    street: string;
    city: string;
    zip: string;
    country: string;
  };
  items: CheckoutItem[];
  temporaryId?: string | null;
  paymentMethod: PaymentMethod;
  delivery: Delivery;
}

/* ========================= Konštanty ========================= */

const SHIPPING_PRICING: Record<DeliveryMethod, number> = {
  pickup: 0,
  post_office: 3.9,
  packeta_box: 2.9,
  post_courier: 4.9,
};

/* ========================= Validácia & sumarizácia ========================= */

function validateDelivery(delivery: Delivery) {
  if (!delivery || !delivery.method) throw new Error('delivery.method is required');

  switch (delivery.method) {
    case 'pickup':
      return;
    case 'post_office': {
      const id = delivery.details?.postOfficeId;
      if (!id) throw new Error('delivery.details.postOfficeId is required for post_office');
      return;
    }
    case 'packeta_box': {
      const boxId = delivery.details?.packetaBoxId;
      if (!boxId) throw new Error('delivery.details.packetaBoxId is required for packeta_box');
      if (!delivery.details?.provider) {
        strapi.log.warn('[DELIVERY] packeta_box bez details.provider — nastavím implicitne "packeta"');
        (delivery.details as DeliveryDetails).provider = 'packeta';
      }
      return;
    }
    case 'post_courier': {
      const a = delivery.address || ({} as Address);
      if (!a.street || !a.city || !a.zip || !a.country) {
        throw new Error('delivery.address is required for post_courier (street, city, zip, country)');
      }
      return;
    }
    default:
      throw new Error(`Unsupported delivery.method: ${String(delivery.method)}`);
  }
}

function summarizeDelivery(delivery: Delivery): string {
  switch (delivery?.method) {
    case 'pickup': return 'Osobné vyzdvihnutie na mieste';
    case 'post_office': return `Na poštu (ID: ${delivery?.details?.postOfficeId})`;
    case 'packeta_box': return delivery?.details?.notes
      ? `Packeta/Carrier box: ${delivery.details.notes}`
      : `Packeta Box (ID: ${delivery?.details?.packetaBoxId})`;
    case 'post_courier': {
      const a = delivery?.address || ({} as Address);
      return `Kuriér na adresu: ${a.street}, ${a.city} ${a.zip}, ${a.country}`;
    }
    default: return String(delivery?.method || '');
  }
}

/* ========================= Service ========================= */

export default () => ({
  async createSession(payload: CheckoutPayload) {
    const FRONTEND_URL = process.env.FRONTEND_URL || '';
    if (!FRONTEND_URL) {
      throw new Error('Missing FRONTEND_URL in environment variables.');
    }

    const { customer, items, temporaryId, paymentMethod, delivery } = payload;

    if (!customer?.email) throw new Error('customer.email is required');
    if (!items?.length) throw new Error('items are required');
    if (!paymentMethod) throw new Error('paymentMethod is required');

    validateDelivery(delivery);

    // 1) nájdi/vytvor zákazníka podľa emailu
    const existing = await strapi.entityService.findMany('api::customer.customer', {
      filters: { email: customer.email },
      limit: 1,
    });
    const customerId = existing.length
      ? existing[0].id
      : (await strapi.entityService.create('api::customer.customer', {
          data: {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            street: customer.street,
            city: customer.city,
            zip: customer.zip,
            country: customer.country,
          },
        })).id;

    // 2) položky objednávky – over produkty + doplň obrázok pre email
    const orderItems = await Promise.all(
      items.map(async (item) => {
        const product = await strapi.entityService.findOne('api::product.product', item.productId, {
          populate: {
            picture_new: { fields: ['url', 'formats'] },
            pictures_new: { fields: ['url', 'formats'] },
          },
        });
    
        if (!product || (typeof product.price !== 'number' && typeof product.price !== 'string')) {
          throw new Error(`Produkt s ID ${item.productId} neexistuje alebo nemá cenu.`);
        }
    
        return {
          productId: item.productId,
          productName: item.productName ?? product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          event: item.event ?? undefined,       // <— PRIDANÉ
          _image: pickProductImage(product),    // len pre email
        };
      })
    );

    const itemsTotal = orderItems.reduce((sum: number, i: any) => sum + i.quantity * i.unitPrice, 0);
    const deliveryMethod: DeliveryMethod = delivery.method;
    const shippingFee = Number(SHIPPING_PRICING[deliveryMethod] ?? 0);
    const totalWithShipping = Number((itemsTotal + shippingFee).toFixed(2));
    const isCard = paymentMethod === 'card';

    // Enumy podľa schémy
    const fulfillmentStatus = 'new';        // ["new","processing","shipped","delivered","cancelled"]
    const deliveryStatus = 'label_created'; // ["label_created","in_transit","at_pickup","delivered","returned"]
    const paymentStatus = 'unpaid';         // ["unpaid","paid","refunded"]
    
    function clampLabel(s: string, def = 'Order') {
      const v = (s || def).trim();
      return v.length <= 16 ? v : v.slice(0, 16);
    }

    // 3) vytvor ORDER
    const order = await strapi.entityService.create('api::order.order', {
      data: {
        customer: customerId,
        customerName: customer.name,
        customerEmail: customer.email,

        shippingAddress: {
          street: customer.street,
          city: customer.city,
          zip: customer.zip,
          country: customer.country,
        },

        deliveryMethod,
        deliveryAddress: delivery.address || null,
        deliveryDetails: delivery.details || null,

        shippingFee,
        total: itemsTotal,
        totalWithShipping,

        items: orderItems.map(({ _image, ...rest }) => rest), // do DB bez _image
        status: 'pending',
        fulfillmentStatus,
        deliveryStatus,
        paymentMethod,
        paymentStatus,
        paymentSessionId: '',
        temporaryId: temporaryId || null,
      },
    });

    // 4A) NE-KARTA – prelinkuj bookingy + pošli emaily + redirect na success
    if (!isCard) {
      // 🔗 prelinkovanie bookingov: temporaryId -> orderId (bez zmeny statusu)
      try {
        if (order.temporaryId) {
          const res = await strapi.db.query('api::event-booking.event-booking').updateMany({
            where: { temporaryId: order.temporaryId, orderId: null },
            data: { orderId: String(order.id) },
          });
          strapi.log.info(`[CHECKOUT][BOOKINGS][NON-CARD] linked by temporaryId (${res.count}) → orderId=${order.id}`);
        }
      } catch (e) {
        strapi.log.warn(`[CHECKOUT][BOOKINGS][NON-CARD] linking failed: ${String(e)}`);
      }

      const deliverySummary = summarizeDelivery(delivery);

      const emailItems = orderItems.map((i: any) => ({
        productName: i.productName,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        image: i._image,
        event: i.event
      }));

      const customerEmailHtml = renderOrderEmail({
        title: 'Potvrdenie objednávky',
        heading: 'Ďakujeme za objednávku',
        introLines: [
          `Dobrý deň, ${customer.name}, vaša objednávka bola prijatá.`,
          `O detailoch vás budeme informovať v ďalšom e-maile.`,
        ],
        cta: {
          label: 'Zobraziť objednávku',
          href: `${FRONTEND_URL}/checkout/success?order=${order.id}`,
        },
        items: emailItems,
        shippingFee,
        totalWithShipping,
        deliverySummary,
      });

      const adminEmailHtml = renderOrderEmail({
        title: `Nová objednávka #${order.id}`,
        heading: `Nová objednávka #${order.id}`,
        introLines: [
          `Zákazník: ${customer.name} (${customer.email})`,
          `Doručenie: ${deliverySummary}`,
        ],
        cta: null,
        items: emailItems,
        shippingFee,
        totalWithShipping,
        deliverySummary,
      });

      try {
        await sendEmail({
          to: customer.email,
          subject: 'Potvrdenie objednávky',
          html: customerEmailHtml,
        });
        await sendEmail({
          to: 'info@appdesign.sk',
          subject: `Nová objednávka #${order.id}`,
          html: adminEmailHtml,
        });
      } catch (e) {
        strapi.log.error('[ORDER][EMAIL][NON-CARD] send failed:', e);
      }

      return { checkoutUrl: `${FRONTEND_URL}/checkout/success?order=${order.id}`, sessionUrl: null };
    }

    // 4B) KARTA – Comgate create + redirect
    {
      const API      = process.env.COMGATE_API || 'https://payments.comgate.cz/v1.0';
      const MERCHANT = process.env.COMGATE_MERCHANT!;
      const SECRET   = process.env.COMGATE_SECRET!;
      const TEST     = String(process.env.COMGATE_TEST || 'false') === 'true';
    
      const qsBody = new URLSearchParams({
        merchant: MERCHANT,
        secret: SECRET,
        test: TEST ? 'true' : 'false',
        country: 'SK',
        curr: 'EUR',
        price: String(Math.round(totalWithShipping * 100)), // v centoch
        label: clampLabel('Order'),                         // max 16 znakov
        refId: String(order.id),
        method: 'ALL',
        email: customer.email,
        phone: customer.phone || '',
        fullName: customer.name,
        prepareOnly: 'true',
        url_paid: process.env.RETURN_PAID || '',
        url_cancelled: process.env.RETURN_CANCELLED || '',
        url_pending: process.env.RETURN_PENDING || '',
      });
    
      const resp = await fetch(`${API}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/x-www-form-urlencoded' },
        body: qsBody.toString(),
      });
      const txt = await resp.text();
      const parsed = Object.fromEntries(new URLSearchParams(txt));
    
      if (parsed.code !== '0') {
        strapi.log.error('[COMGATE][CREATE] error:', parsed);
        throw new Error(parsed.message || 'Comgate create error');
      }
    
      // (odporúčané) ulož transId k objednávke
      try {
        await strapi.db.query('api::order.order').update({
          where: { id: order.id },
          data: { comgateTransId: parsed.transId, paymentStatus: 'waiting_for_payment' },
        });
      } catch (e) {
        strapi.log.warn(`[COMGATE][CREATE] persist transId failed for order #${order.id}: ${String(e)}`);
      }
    
      return {
        checkoutUrl: decodeURIComponent(parsed.redirect), // FE ostáva bez zmeny
        sessionUrl: null,
        orderId: order.id,
        totalWithShippingCents: Math.round(totalWithShipping * 100),
      };
    }
  },
});
