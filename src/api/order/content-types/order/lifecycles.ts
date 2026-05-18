// src/api/order/content-types/order/lifecycles.ts
import { sendEmail } from '../../../../utils/email';
import crypto from 'crypto';
declare const strapi: any;

type DeliveryMethod = 'pickup' | 'post_office' | 'packeta_box' | 'post_courier' | 'digital_product';

type EventInfo = {
  sessionId?: number;
  type?: 'workshop' | 'tour' | string;
  startDateTime?: string; // ISO
  peopleCount?: number;
  bookingId?: number;
};

type OrderItem = {
  id?: number | string;
  product?: any;
  productId?: number;
  slug?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  imageUrl?: string | null;
  ean?: string | null;
  event?: EventInfo;

  type?: 'product' | 'gift_voucher' | 'event' | 'service';
  isGiftVoucher?: boolean;
  voucherType?: 'service' | 'value';
  voucherValue?: number | string | null;
  voucherValidTo?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  giftMessage?: string | null;
};

type OrderEntity = {
  id: number;
  documentId?: string | null;
  invoiceNumber?: string | null;

  customerName?: string | null;
  customerEmail?: string | null;
  customer?: {
    id?: number;
    documentId?: string | null;
  } | null;

  items?: OrderItem[] | null;

  deliveryMethod?: DeliveryMethod;
  deliveryDetails?: {
    provider?: string | null;
    packetaBoxId?: string | null;
    postOfficeId?: string | null;
    notes?: string | null;
  } | null;
  deliveryAddress?: {
    street?: string | null;
    city?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null;

  shippingFee?: number | null;
  paymentFee?: number | null;
  total?: number | null;
  totalWithShipping?: number | null;

  deliveryStatus?: string | null;
  fulfillmentStatus?: string | null;

  notes?: string | null;
  paymentStatus?: string | null;

  createdGiftVouchers?: Array<{
    id?: number;
    documentId?: string | null;
    code?: string | null;
  }> | null;
};

const ADMIN_EMAIL =
  process.env.ORDER_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'info@appdesign.sk';

/* ---------------- Normalizácia (pôvodné helpery) --------------- */
const stripStatus = (d: any) => {
  if (d && 'status' in d) delete d.status;
  return d;
};

const mapDelivery = (v: any) => {
  if (v == null || v === '') return 'label_created';
  const m: Record<string, string> = { 'in-transit': 'in_transit', 'at-pickup': 'at_pickup' };
  const s = String(v).trim();
  return m[s] ?? s;
};

const mapFulfillment = (v: any) => (v == null || v === '' ? 'new' : String(v).trim());

/* --------------------- Labely stavov --------------------- */
const statusLabel = (st?: string | null) => {
  if (!st) return '-';
  const map: Record<string, string> = {
    new: 'Nová',
    created: 'Vytvorená',
    processing: 'Spracováva sa',
    label_created: 'Objednávka prijatá',
    in_transit: 'Na ceste',
    at_pickup: 'Na výdajnom mieste',
    shipped: 'Odoslaná',
    delivered: 'Doručená',
    cancelled: 'Zrušená',
    returned: 'Vrátená',
    ready_for_pickup: 'Pripravená na vyzdvihnutie',
  };
  return map[st] || st;
};

/* --------------------- Pomocné formátovanie --------------------- */
const money = (n: number) => `${Number(n || 0).toFixed(2)} €`;

const formatAddress = (addr?: OrderEntity['deliveryAddress']) =>
  [addr?.street, addr?.city, addr?.zip, addr?.country].filter(Boolean).join(', ') || '-';

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
  const people =
    typeof event.peopleCount === 'number' ? ` • Osoby: ${event.peopleCount}` : '';
  return `Termín: ${d}, ${t}${people}`;
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

function isHttpUrl(u?: string | null) {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

function absUrl(url?: string | null): string {
  const u = String(url || '');
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;

  const serverUrl = (strapi.config?.get?.('server.url') as string) || '';
  const base =
    process.env.PUBLIC_UPLOADS_URL ||
    process.env.UPLOADS_BASE_URL ||
    serverUrl;

  if (!base) {
    strapi.log.error('[ORDER][LC][IMG] Missing PUBLIC_UPLOADS_URL/UPLOADS_BASE_URL/server.url – cannot build absolute URL');
    return '';
  }

  const root = String(base).replace(/\/$/, '');
  const rel  = u.startsWith('/') ? u : `/${u}`;
  return `${root}${rel}`;
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

function summarizeDelivery(order: OrderEntity): string {
  switch (order?.deliveryMethod) {
    case 'pickup':
      return 'Osobné vyzdvihnutie na mieste';
    case 'post_office':
      return `Na poštu (ID: ${order?.deliveryDetails?.postOfficeId ?? '-'})`;
    case 'packeta_box':
      return order?.deliveryDetails?.notes
        ? `Packeta/Carrier box: ${order.deliveryDetails.notes}`
        : `Packeta Box (ID: ${order?.deliveryDetails?.packetaBoxId ?? '-'})`;
    case 'post_courier': {
      const a = order?.deliveryAddress || ({} as any);
      return `Kuriér na adresu: ${[a.street, a.city, a.zip, a.country].filter(Boolean).join(', ')}`;
    }
    case 'digital_product':
      return 'Digitálny produkt';
    default:
      return String(order?.deliveryMethod || '-');
  }
}

/* --------------------- HTML renderer --------------------- */
function renderItemsRows(
  items: Array<{
    productName: string;
    unitPrice: number;
    quantity: number;
    image?: string;
    event?: EventInfo;
  }>,
) {
  return items
    .map((it) => {
      const subtotal = it.unitPrice * it.quantity;
      const eventLine = it.event?.startDateTime
        ? `
        <div style="font-size:13px;color:#0e29a0;padding:4px 4px 0 4px;">
          ${esc(formatEvent(it.event))}
        </div>`
        : '';

      const imgHtml = isHttpUrl(it.image)
        ? `<img src="${aesc(it.image!)}" alt="" width="64" height="64" style="object-fit:cover;border-radius:4px;" />`
        : '<img src="https://www.majolika.sk/assets/img/logo-SLM-modre.gif" alt="" width="64" height="64" style="object-fit:cover;border-radius:4px;" />';

      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${imgHtml}
              <div>
                <div style="font-weight:600;color:#333;padding:4px;">${esc(it.productName)}</div>
                ${eventLine}
                <div style="font-size:13px;color:#777;padding:4px;">${money(
                  it.unitPrice,
                )} × ${it.quantity}</div>
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
  items: Array<{ productName: string; unitPrice: number; quantity: number; image?: string; event?: EventInfo }>;
  shippingFee: number;
  paymentFee: number;
  totalWithShipping: number;
  deliverySummary: string;
  orderNotes?: string | null;
}) {
  const itemsRows = renderItemsRows(opts.items);
  const notesHtml = opts.orderNotes
    ? `
      <div style="margin-top:16px;padding:12px;border:1px solid #eaeaea;border-radius:6px;background:#fcfcfc;">
        <div style="font-weight:600;color:#333;margin-bottom:6px;">Poznámka k objednávke</div>
        <div style="font-size:14px;color:#444;line-height:1.5;">${esc(opts.orderNotes).replace(/\n/g, '<br>')}</div>
      </div>
    `
    : '';
  return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <title>${esc(opts.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; }
    .container {
      max-width: 600px; margin: 40px auto; background: #fff url('https://www.majolika.sk/assets/img/corner6.png') no-repeat right bottom;
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
      <h2>${esc(opts.heading)}</h2>
      ${opts.introLines.map((t) => `<p>${esc(t)}</p>`).join('')}
      ${opts.cta ? `<p style="text-align:center;"><a class="button" href="${aesc(opts.cta.href)}">${esc(opts.cta.label)}</a></p>` : ''}

      <h3 style="color:#333;margin-top:32px;">Zhrnutie objednávky</h3>
      <p style="font-size:14px;color:#666;margin:6px 0;"><b>Doručenie:</b> ${esc(opts.deliverySummary)}</p>
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
            <td style="padding:8px 12px;border-top:2px solid #eee;color:#333;">Poplatok za dobierku</td>
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
        <img src="https://www.majolika.sk/assets/img/logo-SLM-modre.gif" alt="SLM logo" />
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* -------------- Načítanie predošlej verzie (kvôli porovnaniu) -------------- */
const fetchPrevOrder = async (event: any): Promise<OrderEntity | null> => {
  try {
    const where = event.params?.where || {};
    const byId = where?.id;
    const byDocId = where?.documentId || event.params?.data?.documentId;

    if (byId) {
      const prev = await strapi.entityService.findOne('api::order.order', byId, {
        populate: {
          deliveryAddress: true,
          deliveryDetails: true,
          items: true,
          createdGiftVouchers: true,
        }
      });
      return (prev as any) || null;
    }

    if (byDocId) {
      const prev = await strapi.db.query('api::order.order').findOne({
        where: { documentId: byDocId },
        populate: {
          deliveryAddress: true,
          deliveryDetails: true,
          items: true,
          createdGiftVouchers: true,
        }
      });
      return (prev as any) || null;
    }

    return null;
  } catch (e) {
    strapi.log.error('[ORDER][LC] fetchPrevOrder error', e);
    return null;
  }
};

/* --------- Načítanie komplet objednávky pre email po update --------- */
const fetchFullOrderForEmail = async (id: number): Promise<OrderEntity> => {
  const full = (await strapi.entityService.findOne('api::order.order', id, {
    populate: ['deliveryAddress', 'deliveryDetails', 'items'],
  })) as any;
  return full as OrderEntity;
};

/* --------- Načítanie komplet objednávky pre voucher/create --------- */
const fetchOrderForVoucher = async (documentId: string): Promise<OrderEntity | null> => {
  try {
    const full = await strapi.documents('api::order.order').findOne({
      documentId,
      populate: {
        customer: true,
        createdGiftVouchers: true,
        items: true,
      },
    });

    return (full as any) || null;
  } catch (e) {
    strapi.log.error('[ORDER][LC][VOUCHER] fetchOrderForVoucher error', e);
    return null;
  }
};

/* --------- Dopĺňanie obrázkov do položiek (persist) --------- */
const fillImages = async (items?: OrderItem[] | null) => {
  if (!Array.isArray(items) || !items.length) return;
  for (const it of items) {
    try {
      if (it.imageUrl) {
        it.imageUrl = absUrl(it.imageUrl);
        continue;
      }
      if (!it.productId) continue;

      const product = await strapi.entityService.findOne(
        'api::product.product',
        Number(it.productId),
        {
          populate: {
            picture_new: { fields: ['url', 'formats'] },
            pictures_new: { fields: ['url', 'formats'] },
          },
        },
      );
      const img = pickProductImage(product);
      it.imageUrl = img || null;
    } catch (e) {
      strapi.log.warn(`[ORDER][LC] fillImages failed for productId=${it.productId}: ${String(e)}`);
    }
  }
};

/* --------- Build položiek pre email (preferuj uložené imageUrl) --------- */
const buildEmailItems = async (order: OrderEntity) => {
  const items = order.items || [];
  return Promise.all(
    items.map(async (it) => {
      let image = absUrl(it.imageUrl || '');
      if (!isHttpUrl(image) && it.productId) {
        try {
          const product = await strapi.entityService.findOne(
            'api::product.product',
            it.productId,
            {
              populate: {
                picture_new: { fields: ['url', 'formats'] },
                pictures_new: { fields: ['url', 'formats'] },
              },
            },
          );
          image = pickProductImage(product);
        } catch {
          image = '';
        }
      }
      return {
        productName: it.productName,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        image,
        event: it.event,
      };
    }),
  );
};

/* ---------------- Voucher helpery ---------------- */
function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isGiftVoucherItem(item: OrderItem): boolean {
  return item?.isGiftVoucher === true || item?.type === 'gift_voucher';
}

async function createGiftVouchersForPaidOrder(orderDocumentId?: string | null) {
  if (!orderDocumentId) return;

  try {
    const order = await fetchOrderForVoucher(orderDocumentId);

    if (!order) {
      strapi.log.warn(`[ORDER][LC][VOUCHER] order not found documentId=${orderDocumentId}`);
      return;
    }

    if (order.paymentStatus !== 'paid') {
      strapi.log.info(`[ORDER][LC][VOUCHER] skip order ${orderDocumentId}, paymentStatus=${order.paymentStatus}`);
      return;
    }

    const existing = Array.isArray(order.createdGiftVouchers) ? order.createdGiftVouchers : [];
    if (existing.length > 0) {
      strapi.log.info(`[ORDER][LC][VOUCHER] vouchers already exist for order ${orderDocumentId}, count=${existing.length}`);
      return;
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const voucherItems = items.filter(isGiftVoucherItem);

    if (!voucherItems.length) {
      strapi.log.info(`[ORDER][LC][VOUCHER] no voucher items for order ${orderDocumentId}`);
      return;
    }

    let createdCount = 0;

    for (const item of voucherItems) {
      const qty = Math.max(1, toNumber(item.quantity, 1));

      for (let i = 0; i < qty; i++) {
        const code = await strapi
          .service('api::gift-voucher.gift-voucher')
          .generateUniqueCode();

        const voucherType = item?.voucherType === 'value' ? 'value' : 'service';
        const amount = item?.voucherValue ?? item?.unitPrice ?? null;

        await strapi.documents('api::gift-voucher.gift-voucher' as any).create({
          data: {
            code,
            status: 'active',
            voucherType,
            title: item?.productName || 'Darčeková poukážka',
            productName: item?.productName || null,
            productSlug: item?.slug || null,
            allowedProductSlug: item?.slug || null,
            amount,
            remainingValue: voucherType === 'value' ? amount : null,
            currency: 'EUR',
            customerName: order.customerName || null,
            customerEmail: order.customerEmail || null,
            validFrom: new Date().toISOString(),
            validTo: item?.voucherValidTo || null,
            orderItemId: item?.id ? String(item.id) : null,
            sourceOrderInvoiceNumber: order.invoiceNumber || null,
            sourceOrder: order.documentId || null,
            customer: order.customer?.documentId || null,
            meta: {
              sourceOrderId: order.id,
              sourceOrderDocumentId: order.documentId,
              sourceItem: item,
              generatedFromLifecycle: true,
            },
          },
        });

        createdCount++;
      }
    }

    strapi.log.info(`[ORDER][LC][VOUCHER] created ${createdCount} voucher(s) for order ${orderDocumentId}`);
  } catch (e) {
    strapi.log.error('[ORDER][LC][VOUCHER] createGiftVouchersForPaidOrder error', e);
  }
}

/* ========================= Lifecycles ========================= */
export default {
  async beforeCreate(event: any) {
    const d = (event.params.data ??= {});

    if (!d.publicToken) {
      d.publicToken = crypto.randomBytes(32).toString('hex');
    }

    stripStatus(d);
    d.fulfillmentStatus = mapFulfillment(d.fulfillmentStatus);
    d.deliveryStatus = mapDelivery(d.deliveryStatus);

    if (typeof d.notes === 'string') d.notes = d.notes.trim() || null;

    if (Array.isArray(d.items) && d.items.length) {
      await fillImages(d.items);
      try {
        strapi.log.info(
          '[ORDER][LC][beforeCreate] items imageUrl preview',
          (d.items || []).map((i: any) => ({
            pid: i.productId,
            img: (i.imageUrl || '').slice(0, 120),
          })),
        );
      } catch {}
    }
  },

  async beforeUpdate(event: any) {
    const d = (event.params.data ??= {});
    stripStatus(d);

    if ('fulfillmentStatus' in d) d.fulfillmentStatus = mapFulfillment(d.fulfillmentStatus);
    if ('deliveryStatus' in d) d.deliveryStatus = mapDelivery(d.deliveryStatus);

    if (!('fulfillmentStatus' in d) || d.fulfillmentStatus === '') d.fulfillmentStatus = 'new';
    if (!('deliveryStatus' in d) || d.deliveryStatus === '') d.deliveryStatus = 'label_created';

    if ('notes' in d && typeof d.notes === 'string') d.notes = d.notes.trim() || null;

    if (Array.isArray(d.items) && d.items.length) {
      await fillImages(d.items);
      try {
        strapi.log.info(
          '[ORDER][LC][beforeUpdate] items imageUrl preview',
          (d.items || []).map((i: any) => ({
            pid: i.productId,
            img: (i.imageUrl || '').slice(0, 120),
          })),
        );
      } catch {}
    }

    try {
      const prev = await fetchPrevOrder(event);
      event.state = event.state || {};
      (event.state as any).prevOrder = prev;
    } catch (e) {
      strapi.log.error('[ORDER][beforeUpdate] prevOrder fetch error', e);
    }

    strapi.log.info(
      `[ORDER][beforeUpdate] id=${event.params?.where?.id ?? event.params?.where?.documentId ?? 'doc'} payload=${JSON.stringify(
        d,
      )}`,
    );
  },

  async afterCreate(event: any) {
    try {
      const createdOrder = event.result as OrderEntity;
      await createGiftVouchersForPaidOrder(createdOrder?.documentId || null);
    } catch (e) {
      strapi.log.error('[ORDER][afterCreate] voucher create error', e);
    }
  },

  async afterUpdate(event: any) {
    try {
      const prev: OrderEntity | null = (event.state as any)?.prevOrder || null;
      const next: OrderEntity = event.result as any;

      const prevStatus = prev?.deliveryStatus ?? null;
      const nextStatus = next?.deliveryStatus ?? null;

      const prevPaymentStatus = prev?.paymentStatus ?? null;
      const nextPaymentStatus = next?.paymentStatus ?? null;

      if (nextPaymentStatus === 'paid') {
        await createGiftVouchersForPaidOrder(next?.documentId || null);
      }

      if (nextStatus && prevStatus !== nextStatus) {
        const full = await fetchFullOrderForEmail(next.id);
        const emailItems = await buildEmailItems(full);

        const shippingFee = Number(full.shippingFee || 0);
        const paymentFee = Number(full.paymentFee || 0);
        const itemsTotal = Number(full.total || 0);
        const totalWithShipping =
          full.totalWithShipping != null
            ? Number(full.totalWithShipping)
            : Number((itemsTotal + shippingFee + paymentFee).toFixed(2));
        const deliverySummary = summarizeDelivery(full);
        const orderNotes = (full.notes || '').trim() || null;

        const subject = `Zmena stavu doručenia: ${statusLabel(nextStatus)} (objednávka #${full.id})`;

        const FRONTEND_URL = process.env.FRONTEND_URL || '';
        const cta =
          FRONTEND_URL
            ? { label: 'Zobraziť objednávku', href: `${FRONTEND_URL.replace(/\/$/, '')}/checkout/success?order=${full.id}` }
            : null;

        const customerHtml = renderOrderEmail({
          title: subject,
          heading: `Stav doručenia: ${statusLabel(nextStatus)}`,
          introLines: [
            `Dobrý deň${full.customerName ? ', ' + esc(full.customerName) : ''},`,
            `stav vašej objednávky č. ${full.id} bol zmenený z „${statusLabel(
              prevStatus,
            )}“ na „${statusLabel(nextStatus)}“.`,
          ],
          cta,
          items: emailItems,
          shippingFee,
          paymentFee,
          totalWithShipping,
          deliverySummary,
          orderNotes,
        });

        const adminHtml = renderOrderEmail({
          title: `[ADMIN] ${subject}`,
          heading: `Objednávka #${full.id} – ${statusLabel(prevStatus)} → ${statusLabel(nextStatus)}`,
          introLines: [
            `Zákazník: ${esc(full.customerName || '-')} (${esc(full.customerEmail || '-')})`,
            `Doručenie: ${esc(deliverySummary)}`,
          ],
          cta: null,
          items: emailItems,
          shippingFee,
          paymentFee,
          totalWithShipping,
          deliverySummary,
          orderNotes,
        });

        const tasks: Promise<any>[] = [];
        if (full.customerEmail) {
          tasks.push(sendEmail({ to: full.customerEmail, subject, html: customerHtml }));
        }
        if (ADMIN_EMAIL) {
          tasks.push(
            sendEmail({ to: ADMIN_EMAIL, subject: `[ADMIN] ${subject}`, html: adminHtml }),
          );
        }

        await Promise.all(tasks);
        strapi.log.info(
          `[ORDER][afterUpdate] deliveryStatus changed ${prevStatus} -> ${nextStatus}, emails sent (orderId=${full.id})`,
        );
      }
    } catch (e) {
      strapi.log.error('[ORDER][afterUpdate] notify error', e);
    }
  },
};