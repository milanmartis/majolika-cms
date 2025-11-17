'use strict';
import { sendEmail } from '../../../utils/email';
import { recalcSessionsByTemporaryId, recalcSessionsByOrderId } from '../../../utils/sessions';

/* ========================= Helpery ========================= */
function escapeHtml(s: string = ''): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}




interface EventInfo {
  sessionId?: number;
  type?: 'workshop' | 'tour' | string;
  startDateTime?: string;   // ISO v UTC
  peopleCount?: number;
  bookingId?: number;
}

interface CheckoutItem {
  productId: number;
  productName?: string;
  quantity: number;
  unitPrice: number;
  event?: EventInfo;
}

function formatEvent(event?: EventInfo): string {
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
  const people = typeof event.peopleCount === 'number' ? ` • Osoby: ${event.peopleCount}` : '';
  return `Termín: ${d}, ${t}${people}`;
}

function formatNowSk(): string {
  const now = new Date();
  return new Intl.DateTimeFormat('sk-SK', {
    timeZone: 'Europe/Bratislava',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
}

function absUrl(url?: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;

  const serverUrl = (strapi.config?.get?.('server.url') as string) || '';
  const base =
    process.env.PUBLIC_UPLOADS_URL ||
    process.env.UPLOADS_BASE_URL ||
    serverUrl ||
    process.env.FRONTEND_URL ||
    '';

  if (!base) {
    strapi.log.warn('[EMAIL][IMG] Missing base URL; cannot build absolute image URL');
    return '';
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

function money(n: number) {
  return `${n.toFixed(2)} €`;
}

function renderItemsRows(items: Array<{
  productName: string;
  unitPrice: number;
  quantity: number;
  image?: string;
  event?: EventInfo;
}>) {
  return items
    .map((it) => {
      const subtotal = it.unitPrice * it.quantity;
      const eventLine = it.event?.startDateTime
        ? `<div style="font-size:13px;color:#0e29a0;padding:4px 4px 0 4px;">${formatEvent(it.event)}</div>`
        : '';
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${it.image
                ? `<img src="${it.image}" alt="" width="64" height="64" style="object-fit:cover;border-radius:0px;" />`
                : '<img src="https://www.majolika.sk/assets/img/logo-SLM-modre.gif" alt="" width="64" height="64" style="object-fit:cover;border-radius:0px;" />'}
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
        </tr>`;
    })
    .join('');
}

/** Jednotná HTML šablóna – fixná hlavička a päta, premenné: heading, bodyHtml, tabuľka so zhrnutím */
function renderEmail(opts: {
  title: string;
  heading: string;
  bodyHtml: string; // ← iba toto sa mení podľa variantu
  items: Array<{ productName: string; unitPrice: number; quantity: number; image?: string; event?: EventInfo }>;
  shippingFee: number;
  paymentFee: number;
  totalWithShipping: number;
  deliverySummary: string;
  cta?: { label: string; href: string } | null;
  orderNotes?: string | null;
}) {
  const itemsRows = renderItemsRows(opts.items);
  // v renderEmail v checkout.ts nahraď časť s "Poznámka:" za tento blok:
const notesHtml = opts.orderNotes && String(opts.orderNotes).trim()
? `<div style="margin:16px 0;padding:12px;border:1px solid #eaeaea;border-radius:0px;background:#fcfcfc;">
     <div style="font-weight:600;color:#333;margin-bottom:6px;">Poznámka k objednávke</div>
     <div style="font-size:14px;color:#444;line-height:1.5;">${escapeHtml(String(opts.orderNotes)).replace(/\n/g,'<br>')}</div>
   </div>`
: '';

  return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <title>${opts.title}</title>
  <style>
    body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; }
    .container {
      max-width: 600px; margin: 40px auto; border-radius: 0px; box-shadow: 0 0 10px rgba(0,0,0,0.05); overflow: hidden;
    }
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
      <h2>${opts.heading}</h2>
      ${opts.bodyHtml}
      ${opts.cta ? `<p style="text-align:center;"><a class="button" href="${opts.cta.href}">${opts.cta.label}</a></p>` : ''}

      <h3 style="color:#333;margin-top:32px;">Zhrnutie objednávky</h3>
      <p style="font-size:14px;color:#666;margin:6px 0;"><b>Doručenie:</b> ${opts.deliverySummary}</p>

      ${notesHtml}


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
            <td style="padding:8px 12px;border-top:2px solid #eee;color:#333;">Poplatok za dopravu</td>
            <td align="right" style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${money(opts.shippingFee)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border-top:2px solid #eee;color:#333;">Poplatk za dobierku</td>
            <td align="right" style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${money(opts.paymentFee)}</td>
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
        <img src="https://www.majolika.sk/assets/img/logo-SLM-modre.gif" alt="SLM logo" width="200" />
      </div>
    </div>
  </div>
</body>
</html>`;
}

/** Špeciálny blok s inštrukciami pre bankový prevod */
function renderBankTransferBlock(orderId: string | number, total: number) {
  const IBAN = 'SK97 0900 0000 0051 3558 7112 (Slovenská sporiteľňa)';
  const IBAN2 = 'SK17 0200 0000 0000 0241 9112 (VUB banka)';
  const vs = String(orderId); // ← kľúčové

  return `
    <div style="margin:20px 0;padding:16px;border:1px solid #e2e8f0;border-radius:0px;background:#f8fafc;">
      <div style="font-weight:700;color:#0e29a0;margin-bottom:8px;">Platba bankovým prevodom</div>
      <div style="line-height:1.7;color:#333;">
        Prosíme Vás o úhradu podľa nasledovných údajov:<br/>
        • IBAN: ${IBAN}<br/>
        • IBAN: ${IBAN2}<br/>
        • Variabilný symbol: ${vs}<br/>
        • Suma: ${money(total)}<br/><br/>
        Objednávku začneme spracovávať hneď po pripísaní platby na náš účet.
      </div>
    </div>`;
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
  provider?: string;      // 'packeta' alebo 'carrier:<id>'
  postOfficeId?: string;  // Slovenská pošta
  packetaBoxId?: string;  // Packeta/Carrier PUDO ID
  notes?: string;         // sumár z widgetu
}

interface Delivery {
  method: DeliveryMethod;
  address?: Address | null;
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
  shippingFee?: number;
  paymentFee?: number;
  locale?: string;
  notes?: string;        

}

/* ========================= Konštanty ========================= */

const SHIPPING_PRICING: Record<DeliveryMethod, number> = {
  pickup: 0,
  post_office: 3.9,
  packeta_box: 2.9,
  post_courier: 4.9,
};

const FREE_SHIPPING_THRESHOLD = 100;

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

function humanDelivery(deliveryMethod: DeliveryMethod): string {
  switch (deliveryMethod) {
    case 'pickup': return 'osobný odber';
    case 'post_office': return 'pošta';
    case 'packeta_box': return 'Packeta';
    case 'post_courier': return 'kuriér';
    default: return String(deliveryMethod);
  }
}

/* ========================= Service ========================= */

export default () => ({
  async createSession(payload: CheckoutPayload) {
    const FRONTEND_URL = process.env.FRONTEND_URL || '';
    if (!FRONTEND_URL) throw new Error('Missing FRONTEND_URL in environment variables.');

    const { customer, items, temporaryId, paymentMethod, delivery } = payload;
    const orderNotes = (payload.notes || '').trim();
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
          event: item.event ?? undefined,
          _image: pickProductImage(product),
        };
      })
    );

    const itemsTotal = orderItems.reduce((sum: number, i: any) => sum + i.quantity * i.unitPrice, 0);
    const deliveryMethod: DeliveryMethod = delivery.method;

    // doprava (s prahom pre free shipping)
    const baseShipping = Number((payload as any).shippingFee ?? SHIPPING_PRICING[deliveryMethod] ?? 0);
    const shippingFee = itemsTotal >= FREE_SHIPPING_THRESHOLD ? 0 : baseShipping;

    const paymentFee = Number((payload as any).paymentFee ?? 0);
    const totalWithShipping = Number((itemsTotal + shippingFee + paymentFee).toFixed(2));
    const isCard = paymentMethod === 'card';

    // Enumy podľa schémy
    const fulfillmentStatus = 'new';
    const deliveryStatus = 'label_created';
    const paymentStatus = 'unpaid';

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
        customerPhone: customer.phone,
        notes: orderNotes || null,

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
        paymentFee,
        total: itemsTotal,
        totalWithShipping,

        items: orderItems.map(({ _image, ...rest }) => ({
          ...rest,
          imageUrl: absUrl(_image),

        })),
        status: 'pending',
        orderStatus: 'pending',
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
      try {
        if (order.temporaryId) {
          const res = await strapi.db.query('api::event-booking.event-booking').updateMany({
            where: { temporaryId: order.temporaryId, orderId: null },
            data: {
              orderId: String(order.id),
              status: 'confirmed',
              customerEmail: customer.email,
              customerName: customer.name,
              customerPhone: customer.phone,
            },
          });
          strapi.log.info(`[CHECKOUT][BOOKINGS][NON-CARD] linked by temporaryId (${res.count}) → orderId=${order.id}`);
        }
      } catch (e) {
        strapi.log.warn(`[CHECKOUT][BOOKINGS][NON-CARD] linking failed: ${String(e)}`);
      }

      try {
        if (order.temporaryId) await recalcSessionsByTemporaryId(order.temporaryId);
        await recalcSessionsByOrderId(order.id);
      } catch (e) {
        strapi.log.error('[GCAL][NON-CARD] recalc failed:', e);
      }

      const deliverySummary = summarizeDelivery(delivery);
      const emailItems = orderItems.map((i: any) => ({
        productName: i.productName,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        image: i._image,
        event: i.event,
      }));

      const orderNo = order.id;
      const orderDate = formatNowSk();
      const deliveryHuman = humanDelivery(deliveryMethod);
      const subject = `Potvrdenie objednávky č. ${orderNo}`;

      let bodyCustomerHtml = '';
      let bodyAdminIntro = '';

      if (paymentMethod === 'bank') {
        // Bankový prevod – špeciálne telo
        bodyCustomerHtml = `
          <p>Dobrý deň,</p>
          <p>ďakujeme za Vašu objednávku v našom e-shope.</p>
          <p><b>Podrobnosti objednávky:</b><br/>
          • Číslo objednávky: ${orderNo}<br/>
          • Dátum: ${orderDate}<br/>
          • Spôsob platby: bankový prevod<br/>
          • Spôsob doručenia: ${deliveryHuman}</p>
          ${renderBankTransferBlock(orderNo, totalWithShipping)}
        `;
        bodyAdminIntro = `Platba: bankový prevod`;
      } else {
        // Ostatné nekartové (dobierka / na mieste / pošta)
        const pmHuman =
          paymentMethod === 'cod' ? 'dobierka' :
          paymentMethod === 'onsite' ? 'platba na mieste' :
          paymentMethod === 'post' ? 'platba na pošte' :
          'nekartová platba';

        bodyCustomerHtml = `
          <p>Dobrý deň,</p>
          <p>ďakujeme za Vašu objednávku na našom e-shope majolika.sk.</p>
          <p><b>Podrobnosti objednávky:</b><br/>
          • Číslo objednávky: ${orderNo}<br/>
          • Dátum: ${orderDate}<br/>
          • Spôsob platby: ${pmHuman}<br/>
          • Spôsob doručenia: ${deliveryHuman}</p>
          <p>O ďalšom priebehu Vás budeme informovať emailom.</p>
        `;
        bodyAdminIntro = `Platba: ${pmHuman}`;
      }

      const customerEmailHtml = renderEmail({
        title: subject,
        heading: `Potvrdenie objednávky č. ${orderNo}`,
        bodyHtml: bodyCustomerHtml,
        cta: { label: 'Zobraziť objednávku', href: `${FRONTEND_URL}/checkout/success?order=${order.id}` },
        items: emailItems,
        shippingFee,
        paymentFee,
        totalWithShipping,
        deliverySummary,
        orderNotes,
      });

      const adminEmailHtml = renderEmail({
        title: `Nová objednávka #${order.id}`,
        heading: `Nová objednávka #${order.id}`,
        bodyHtml: `
          <p>Zákazník: ${customer.name} (${customer.email})</p>
          <p>Doručenie: ${deliverySummary}</p>
          <p>${bodyAdminIntro}</p>
        `,
        cta: null,
        items: emailItems,
        shippingFee,
        paymentFee,
        totalWithShipping,
        deliverySummary,
        orderNotes
      });


      const adminEmails = ['info@appdesign.sk', 'romana.uhercikova@majolika.sk', 'katarina.borisova@majolika.sk'];

      try {
        await sendEmail({ to: customer.email, subject, html: customerEmailHtml });
        await sendEmail({ to: 'majolika@majolika.sk', subject: `Nová objednávka #${order.id}`, html: adminEmailHtml });
        // await sendEmail({ to: adminEmails, subject: `Nová objednávka #${order.id}`, html: adminEmailHtml });
        await sendEmail({
          to: adminEmails.join(','),
          subject: `Nová objednávka #${order.id}`,
          html: adminEmailHtml,
        });
        // await Promise.all(
        //   adminEmails.map((email) =>
        //     sendEmail({
        //       to: email,
        //       subject: `Nová objednávka #${order.id}`,
        //       html: adminEmailHtml,
        //     })
        //   )
        // );
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

      try {
        await strapi.db.query('api::order.order').update({
          where: { id: order.id },
          data: { comgateTransId: parsed.transId, paymentStatus: 'unpaid' },
        });
      } catch (e) {
        strapi.log.warn(`[COMGATE][CREATE] persist transId failed for order #${order.id}: ${String(e)}`);
      }

      return {
        checkoutUrl: decodeURIComponent(parsed.redirect),
        sessionUrl: null,
        orderId: order.id,
        totalWithShippingCents: Math.round(totalWithShipping * 100),
      };
    }
  },
});
