'use strict';
import { sendEmail } from '../../../utils/email';
import { recalcSessionsByTemporaryId, recalcSessionsByOrderId } from '../../../utils/sessions';
import { issueInvoiceForOrder } from "../../../utils/issue-invoice";

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
  isDigitalProduct?: boolean;
  isGiftVoucher?: boolean;

  // ✅ voliteľné – ak posiela FE pre giftwrap item
  isGiftWrapProduct?: boolean;
}

/* ========================= 🎁 Gift wrap typy ========================= */
type GiftWrapMode = 'each_item' | 'by_product' | 'all_together';

interface GiftWrapPayloadLine {
  key?: string | null;          // productId:sessionId alebo čokoľvek z FE
  productId: number;
  productName?: string | null;  // FE môže poslať, ak nie, doplníme z orderItems
  cartQty?: number | null;
  wrapQty: number;
}

interface GiftWrapPayload {
  enabled?: boolean;            // FE môže/nechce posielať, tak to dopočítame
  productId: number | null;
  slug?: string | null;
  unitPrice?: number | null;

  selectedQty: number;          // celkový počet zabalených kusov
  mode: GiftWrapMode;
  note?: string | null;

  // čo presne zabaliť
  perProduct?: Array<{ productId: number; wrapQty: number }>; // FE shape (tvoje)
  lines?: GiftWrapPayloadLine[];                              // alternatívne/nové

  // debug/diagnostika
  autoAddedQty?: number | null;
  alreadyInCartQty?: number | null;
}

/* ========================= Format ========================= */
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
  slug: string;
  unitPrice: number;
  quantity: number;
  image?: string;
  event?: EventInfo;

  // 👇 pridáme
  isDigitalProduct?: boolean;
  isGiftVoucher?: boolean;

  // ✅ voliteľné – aby si vedel vizuálne rozlíšiť giftwrap produkt v emaili
  isGiftWrapProduct?: boolean;
}>) {
  return items
    .map((it) => {
      const subtotal = it.unitPrice * it.quantity;
      const eventLine = it.event?.startDateTime
        ? `<div style="font-size:13px;color:#0e29a0;padding:4px 4px 0 4px;">${formatEvent(it.event)}</div>`
        : '';

      const digitalBadge =
        it.isDigitalProduct || it.isGiftVoucher
          ? `<div style="font-size:12px;color:#0e29a0;padding:2px 4px 0 4px;">Digitálny produkt / darčekový poukaz</div>`
          : '';

      const giftWrapBadge =
        it.isGiftWrapProduct
          ? `<div style="font-size:12px;color:#0e29a0;padding:2px 4px 0 4px;">Darčekové balenie (služba)</div>`
          : '';

      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${it.image
                ? `<img src="${it.image}" alt="" width="64" height="64" style="object-fit:cover;border-radius:0px;" />`
                : '<img src="https://www.majolika.sk/assets/img/logo-SLM-modre.gif" alt="" width="64" height="64" style="object-fit:cover;border-radius:0px;" />'}
              <div>
                <div style="font-weight:600;color:#333;padding:4px;">
                  <a href="https://www.majolika.sk/produkt/${it.slug}"
                    style="color:#0e29a0;text-decoration:none;"
                    target="_blank">
                    ${escapeHtml(it.productName)}
                  </a>
                </div>
                ${giftWrapBadge}
                ${digitalBadge}
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

/* ========================= 🎁 Gift wrap blok do emailu ========================= */
function renderGiftWrapHtml(gw?: GiftWrapPayload | null): string {
  if (!gw) return '';

  const selected = Number(gw.selectedQty || 0);
  if (!Number.isFinite(selected) || selected <= 0) return '';

  const modeHuman =
    gw.mode === 'each_item' ? 'Každý kus zvlášť' :
    gw.mode === 'by_product' ? 'Podľa produktov (jeden produkt = jeden balíček)' :
    gw.mode === 'all_together' ? 'Všetko spolu (1 balíček)' :
    String(gw.mode || '');

  const note = typeof gw.note === 'string' ? gw.note.trim() : '';
  const noteHtml = note
    ? `<div style="margin-top:8px;font-size:14px;color:#444;line-height:1.5;">
         <b>Poznámka k baleniu:</b><br/>
         ${escapeHtml(note).replace(/\n/g, '<br/>')}
       </div>`
    : '';

  // preferujeme lines (už obohatené o názvy), fallback: perProduct
  const hasLines = Array.isArray(gw.lines) && gw.lines.length > 0;
  const lines = (gw.lines || []).filter(l => Number(l.wrapQty || 0) > 0);

  const linesHtml = hasLines && lines.length
    ? `
      <div style="margin-top:10px;">
        <div style="font-weight:600;color:#333;margin-bottom:6px;">Čo zabaliť:</div>
        <div style="font-size:14px;color:#444;line-height:1.6;">
          ${lines.map(l => {
            const nm = (l.productName || `Produkt #${l.productId}`) as string;
            const cartQty = Number(l.cartQty || 0);
            const wrapQty = Number(l.wrapQty || 0);
            const tail = cartQty > 0 ? ` z ${cartQty} ks` : '';
            return `• ${escapeHtml(nm)} — zabaliť: <b>${wrapQty}</b>${tail}`;
          }).join('<br/>')}
        </div>
      </div>`
    : (Array.isArray(gw.perProduct) && gw.perProduct.length
      ? `
        <div style="margin-top:10px;">
          <div style="font-weight:600;color:#333;margin-bottom:6px;">Čo zabaliť:</div>
          <div style="font-size:14px;color:#444;line-height:1.6;">
            ${gw.perProduct
              .filter(x => Number(x.wrapQty || 0) > 0)
              .map(x => `• Produkt #${escapeHtml(String(x.productId))} — zabaliť: <b>${escapeHtml(String(x.wrapQty))}</b>`)
              .join('<br/>')}
          </div>
        </div>`
      : '');

  return `
    <div style="margin:16px 0;padding:12px;border:1px solid #eaeaea;border-radius:0px;background:#fcfcfc;">
      <div style="font-weight:700;color:#0e29a0;margin-bottom:6px;">Darčekové balenie</div>
      <div style="font-size:14px;color:#444;line-height:1.5;">
        <b>Počet balení:</b> ${escapeHtml(String(selected))}<br/>
        <b>Ako zabaliť:</b> ${escapeHtml(modeHuman)}
      </div>
      ${linesHtml}
      ${noteHtml}
    </div>
  `;
}

/** Jednotná HTML šablóna – fixná hlavička a päta, premenné: heading, bodyHtml, tabuľka so zhrnutím */
function renderEmail(opts: {
  title: string;
  heading: string;
  bodyHtml: string; // ← iba toto sa mení podľa variantu
  items: Array<{
    productName: string;
    slug: string;
    unitPrice: number;
    quantity: number;
    image?: string;
    event?: EventInfo;
    isDigitalProduct?: boolean;
    isGiftVoucher?: boolean;
    isGiftWrapProduct?: boolean;
  }>;
  shippingFee: number;
  paymentFee: number;
  totalWithShipping: number;
  deliverySummary: string;
  cta?: { label: string; href: string } | null;
  orderNotes?: string | null;
  billingHtml?: string | null;
  invoiceNumber: string | null;

  // ✅ nové
  giftWrap?: GiftWrapPayload | null;
}) {
  const itemsRows = renderItemsRows(opts.items);

  const giftWrapHtml = renderGiftWrapHtml(opts.giftWrap);

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
    

      <h3 style="color:#333;margin-top:32px;">Zhrnutie objednávky</h3>
      <p style="font-size:14px;color:#666;margin:6px 0;"><b>Doručenie:</b> ${opts.deliverySummary}</p>

      ${opts.billingHtml || ''}

      ${giftWrapHtml}

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
        <a href="https://www.majolika.sk"><img src="https://www.majolika.sk/assets/img/logo-SLM-modre.gif" border=0 alt="SLM logo" width="200" /></a>
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
type DeliveryUrgency = 'standard' | 'rush';
type PaymentMethod = 'card' | 'cod' | 'bank' | 'onsite' | 'post';
type DeliveryMethod = 'pickup' | 'post_office' | 'packeta_box' | 'post_courier' | 'digital_product';

interface Address {
  street: string;
  city: string;
  zip: string;
  country: string;
}

interface BillingInfo {
  isCompany: boolean;
  companyName?: string;
  ico?: string;
  dic?: string;
  icDph?: string;
  address?: Address | null;
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
  deliveryUrgency?: DeliveryUrgency;
  billing?: BillingInfo;

  // ✅ nové: darčekové balenie (inštrukcie pre balenie + poznámka)
  giftWrap?: GiftWrapPayload | null;
}

/* ========================= Konštanty ========================= */

const SHIPPING_PRICING: Record<DeliveryMethod, number> = {
  pickup: 0,
  post_office: 5.0,
  packeta_box: 5.0,
  post_courier: 7.0,
  digital_product: 0,
};

const FREE_SHIPPING_THRESHOLD = 100;

/* ========================= Validácia & sumarizácia ========================= */

function validateDelivery(delivery: Delivery) {
  if (!delivery || !delivery.method) throw new Error('delivery.method is required');

  switch (delivery.method) {
    case 'pickup':
      return;

    case 'digital_product':
      // Digitálny produkt – nič neposielame, žiadne ďalšie validácie netreba
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
    case 'pickup':
      return 'Osobné vyzdvihnutie na mieste';

    case 'post_office': {
      const a = (delivery?.address || {}) as Address;
      const addrStr = [a.street, a.city, a.zip].filter(Boolean).join(', ');
      const id = delivery?.details?.postOfficeId;

      if (addrStr && id) {
        return `Na poštu: ${addrStr} (ID: ${id})`;
      }
      if (addrStr) {
        return `Na poštu: ${addrStr}`;
      }
      return `Na poštu (ID: ${id || '-'})`;
    }

    case 'packeta_box':
      return delivery?.details?.notes
        ? `Packeta/Carrier box: ${delivery.details.notes}`
        : `Packeta Box (ID: ${delivery?.details?.packetaBoxId})`;

    case 'post_courier': {
      const a = delivery?.address || ({} as Address);
      return `Kuriér na adresu: ${a.street}, ${a.city} ${a.zip}, ${a.country}`;
    }

    case 'digital_product':
      return 'Digitálny produkt (bez fyzického doručenia)';

    default:
      return String(delivery?.method || '');
  }
}

function humanDelivery(deliveryMethod: DeliveryMethod): string {
  switch (deliveryMethod) {
    case 'pickup':
      return 'osobný odber';
    case 'post_office':
      return 'pošta';
    case 'packeta_box':
      return 'Packeta';
    case 'post_courier':
      return 'kuriér';
    case 'digital_product':
      return 'digitálny produkt';
    default:
      return String(deliveryMethod);
  }
}

/* ========================= Service ========================= */

export default () => ({
  async createSession(payload: CheckoutPayload) {
    const FRONTEND_URL = process.env.FRONTEND_URL || '';
    if (!FRONTEND_URL) throw new Error('Missing FRONTEND_URL in environment variables.');

    const {
      customer,
      items,
      temporaryId,
      paymentMethod,
      delivery,
      deliveryUrgency = 'standard',
      billing,
      giftWrap: giftWrapRaw,
    } = payload;

    const orderNotes = (payload.notes || '').trim();
    if (!customer?.email) throw new Error('customer.email is required');
    if (!items?.length) throw new Error('items are required');
    if (!paymentMethod) throw new Error('paymentMethod is required');

    validateDelivery(delivery);

    // =========================
    // 🎁 normalizácia giftWrap z FE (aby bol stabilný DB + email)
    // =========================
    const normalizeGiftWrap = (
      gw: GiftWrapPayload | null | undefined,
      orderItemsForNames?: Array<{ productId: number; productName: string; quantity: number }>
    ): GiftWrapPayload | null => {
      if (!gw) return null;

      const selectedQty = Number((gw as any).selectedQty || 0);
      if (!Number.isFinite(selectedQty) || selectedQty <= 0) return null;

      const mode = (gw as any).mode as GiftWrapMode;
      if (mode !== 'each_item' && mode !== 'by_product' && mode !== 'all_together') {
        // fallback aby ti to nikdy nepoložilo checkout
        (gw as any).mode = 'each_item';
      }

      const note = typeof (gw as any).note === 'string' ? (gw as any).note.trim() : '';
      const enabled = (gw as any).enabled === true || selectedQty > 0;

      // build map productId -> name + cartQty
      const namesMap = new Map<number, { name: string; cartQty: number }>();
      for (const it of (orderItemsForNames || [])) {
        namesMap.set(Number(it.productId), {
          name: String(it.productName || `Produkt #${it.productId}`),
          cartQty: Number(it.quantity || 0),
        });
      }

      // FE shape v tvojom Angular kóde: giftWrap.perProduct = [{productId, wrapQty}]
      const perProduct = Array.isArray((gw as any).perProduct) ? (gw as any).perProduct : [];

      // ak FE posiela lines, použijeme ich, inak ich vytvoríme z perProduct
      let lines: GiftWrapPayloadLine[] = [];
      if (Array.isArray((gw as any).lines)) {
        lines = (gw as any).lines
          .map((l: any) => ({
            key: l?.key ?? null,
            productId: Number(l?.productId),
            productName: l?.productName ?? null,
            cartQty: l?.cartQty ?? null,
            wrapQty: Number(l?.wrapQty || 0),
          }))
          .filter((l: GiftWrapPayloadLine) => Number.isFinite(l.productId) && l.productId > 0 && l.wrapQty > 0);
      } else {
        lines = perProduct
          .map((x: any) => ({
            key: null,
            productId: Number(x?.productId),
            productName: null,
            cartQty: null,
            wrapQty: Number(x?.wrapQty || 0),
          }))
          .filter((l: GiftWrapPayloadLine) => Number.isFinite(l.productId) && l.productId > 0 && l.wrapQty > 0);
      }

      // obohať názvy + cartQty z orderItems (aby email/admin nemusel hádať)
      lines = lines.map((l) => {
        const meta = namesMap.get(Number(l.productId));
        return {
          ...l,
          productName: (l.productName && String(l.productName).trim()) ? String(l.productName).trim() : (meta?.name ?? `Produkt #${l.productId}`),
          cartQty: (l.cartQty != null && Number(l.cartQty) > 0) ? Number(l.cartQty) : (meta?.cartQty ?? null),
        };
      });

      const normalized: GiftWrapPayload = {
        enabled,
        productId: (gw as any).productId ?? null,
        slug: (gw as any).slug ?? null,
        unitPrice: (gw as any).unitPrice ?? null,
        selectedQty,
        mode: (gw as any).mode,
        note: note || null,
        perProduct: perProduct
          .map((x: any) => ({ productId: Number(x?.productId), wrapQty: Number(x?.wrapQty || 0) }))
          .filter((x: any) => Number.isFinite(x.productId) && x.productId > 0 && Number(x.wrapQty) > 0),
        lines,
        autoAddedQty: (gw as any).autoAddedQty ?? null,
        alreadyInCartQty: (gw as any).alreadyInCartQty ?? null,
      };

      return normalized;
    };

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

    const orderItems = await Promise.all(
      items.map(async (item: CheckoutItem) => {
        const product = await strapi.entityService.findOne('api::product.product', item.productId, {
          populate: {
            picture_new: { fields: ['url', 'formats'] },
            pictures_new: { fields: ['url', 'formats'] },
          },
        });

        if (!product || (typeof product.price !== 'number' && typeof product.price !== 'string')) {
          throw new Error(`Produkt s ID ${item.productId} neexistuje alebo nemá cenu.`);
        }

        const ean =
          (product as any).ean ||
          (product as any).eanCode ||
          (product as any).ean_code ||
          (product as any).ean_kod ||
          null;

        // 👇 flag z frontendu, fallback z produktu ak chceš:
        const isDigitalProduct =
          item.isDigitalProduct ??
          (product as any).isDigitalProduct ??
          false;

        const isGiftVoucher =
          item.isGiftVoucher ??
          (product as any).isGiftVoucher ??
          false;

        // ✅ ak FE posiela flag pre giftwrap item, uložíme ho do itemu (pre email badge + DB)
        const isGiftWrapProduct = (item as any).isGiftWrapProduct === true;

        return {
          productId: item.productId,
          productName: item.productName ?? product.name,
          slug: product.slug,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          event: item.event ?? undefined,
          _image: pickProductImage(product),
          ean,
          isDigitalProduct,
          isGiftVoucher,
          isGiftWrapProduct,
        };
      })
    );

    // ✅ až teraz vieme obohatiť giftWrap o názvy produktov z košíka
    const giftWrap = normalizeGiftWrap(
      giftWrapRaw as any,
      orderItems.map((x: any) => ({ productId: x.productId, productName: x.productName, quantity: x.quantity }))
    );

    const hasEventSession = orderItems.some((it: any) => it?.event?.sessionId);
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

    // Billing data pre DB
    const billingDbData = billing && billing.isCompany
      ? {
          billingIsCompany: true,
          billingCompanyName: billing.companyName || null,
          billingIco: billing.ico || null,
          billingDic: billing.dic || null,
          billingIcDph: billing.icDph || null,
          billingAddress: billing.address || null,
        }
      : {
          billingIsCompany: false,
          billingCompanyName: null,
          billingIco: null,
          billingDic: null,
          billingIcDph: null,
          billingAddress: null,
        };

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

        deliveryMethod: deliveryMethod as any,
        deliveryAddress: delivery.address || null,
        deliveryDetails: delivery.details || null,
        deliveryUrgency,

        shippingFee,
        paymentFee,
        total: itemsTotal,
        totalWithShipping,

        giftWrap: giftWrap ? JSON.parse(JSON.stringify(giftWrap)) : null,
        giftWrapMode: giftWrap?.mode ?? null,
        giftWrapNote: giftWrap?.note ?? null,
        giftWrapSelectedQty: giftWrap?.selectedQty ?? 0,

        items: orderItems.map(({ _image, event, ...rest }) => ({
          ...rest,
          imageUrl: absUrl(_image),

          // JSON pole v Strapi musí byť JSONValue
          event: event ? JSON.parse(JSON.stringify(event)) : null,
        })),
        // status: 'pending',
        orderStatus: 'pending',
        fulfillmentStatus,
        deliveryStatus,
        paymentMethod,
        paymentStatus,
        paymentSessionId: '',
        temporaryId: temporaryId || null,
        ...billingDbData,
      } as any,
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

      let invoiceNumber: string | null = null;
      try {
        const inv = await issueInvoiceForOrder(order.id);
        invoiceNumber = inv?.invoiceNumber || null;
      } catch (e) {
        strapi.log.error('[INVOICE][NON-CARD] issue failed:', e);
      }

      const baseDeliverySummary = summarizeDelivery(delivery);
      const urgencySuffix =
        deliveryUrgency === 'rush'
          ? ' – objednávka ponáhľa'
          : ' – štandardná doba dodania (cca 2 týždne)';
      const deliverySummary = `${baseDeliverySummary}${urgencySuffix}`;

      const emailItems = orderItems.map((i: any) => ({
        productName: i.productName,
        slug: i.slug,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        image: i._image,
        event: i.event,

        // 👇 prenesieme do šablóny
        isDigitalProduct: !!i.isDigitalProduct || !!i.isGiftVoucher,
        isGiftVoucher: !!i.isGiftVoucher,

        // ✅ darčekové balenie product badge
        isGiftWrapProduct: !!i.isGiftWrapProduct,
      }));

      const billingHtml =
        billing && billing.isCompany
          ? `
            <div style="margin:16px 0;padding:12px;border:1px solid #eaeaea;border-radius:0px;background:#fcfcfc;">
              <div style="font-weight:600;color:#333;margin-bottom:6px;">Fakturačné údaje</div>
              <div style="font-size:14px;color:#444;line-height:1.5;">
                ${escapeHtml(billing.companyName || '')}<br/>
                IČO: ${escapeHtml(billing.ico || '')}<br/>
                ${billing.dic ? `DIČ: ${escapeHtml(billing.dic)}<br/>` : ''}
                ${billing.icDph ? `IČ DPH: ${escapeHtml(billing.icDph)}<br/>` : ''}
                ${
                  billing.address
                    ? `${escapeHtml(billing.address.street || '')}, ${escapeHtml(
                        billing.address.zip || '',
                      )} ${escapeHtml(billing.address.city || '')}, ${escapeHtml(
                        billing.address.country || '',
                      )}`
                    : ''
                }
              </div>
            </div>`
          : '';

      const orderNo = order.id;
      const orderDate = formatNowSk();
      const deliveryHuman = humanDelivery(deliveryMethod);
      const subject = `Potvrdenie objednávky č. ${invoiceNumber || orderNo}`;

      let bodyCustomerHtml = '';
      let bodyAdminIntro = '';

      if (paymentMethod === 'bank') {
        // Bankový prevod – špeciálne telo
        bodyCustomerHtml = `
          <p>Dobrý deň,</p>
          <p>ďakujeme za Vašu objednávku v našom e-shope.</p>
          <p><b>Podrobnosti objednávky:</b><br/>
          • Číslo objednávky: ${invoiceNumber || String(order.id)}<br/>
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
          • Číslo objednávky: ${invoiceNumber || String(order.id)}<br/>
          • Dátum: ${orderDate}<br/>
          • Spôsob platby: ${pmHuman}<br/>
          • Spôsob doručenia: ${deliveryHuman}</p>
          <p>O ďalšom priebehu Vás budeme informovať emailom.</p>
        `;
        bodyAdminIntro = `Platba: ${pmHuman}`;
      }

      const customerEmailHtml = renderEmail({
        title: subject,
        heading: `Potvrdenie objednávky č. ${invoiceNumber}`,
        bodyHtml: bodyCustomerHtml,
        cta: { label: 'Zobraziť objednávku', href: `${FRONTEND_URL}/checkout/success?order=${order.id}` },
        items: emailItems,
        shippingFee,
        paymentFee,
        totalWithShipping,
        deliverySummary,
        orderNotes,
        billingHtml,
        invoiceNumber,

        // ✅ gift wrap do emailu
        giftWrap,
      });

      const addrLine = [
        customer.street,
        `${customer.zip} ${customer.city}`.trim(),
        customer.country,
      ]
        .filter(Boolean)
        .join(', ');

      const productsWithEanHtml = orderItems
        .map((it: any) => {
          const ean =
            it.ean ||
            it.eanCode ||
            it.ean_code ||
            it.ean_kod ||
            '-';
          return `• ${escapeHtml(it.productName || `Produkt #${it.productId}`)} – EAN: ${escapeHtml(String(ean))}, množstvo: ${it.quantity}`;
        })
        .join('<br/>');

      // ✅ admin: vypíš gift wrap textovo (okrem pekného boxu v šablóne)
      const giftWrapAdminInline = giftWrap && Number(giftWrap.selectedQty || 0) > 0
        ? (() => {
            const modeHuman =
              giftWrap.mode === 'each_item' ? 'Každý kus zvlášť' :
              giftWrap.mode === 'by_product' ? 'Podľa produktov' :
              giftWrap.mode === 'all_together' ? 'Všetko spolu' :
              String(giftWrap.mode || '');

            const lines = Array.isArray(giftWrap.lines) ? giftWrap.lines.filter(l => Number(l.wrapQty || 0) > 0) : [];
            const linesHtml = lines.length
              ? lines.map(l => `• ${escapeHtml(String(l.productName || `Produkt #${l.productId}`))} — ${escapeHtml(String(l.wrapQty))}${l.cartQty ? ` z ${escapeHtml(String(l.cartQty))}` : ''}`).join('<br/>')
              : '';

            const note = typeof giftWrap.note === 'string' ? giftWrap.note.trim() : '';
            return `
              <p><b>Darčekové balenie:</b><br/>
                Počet: ${escapeHtml(String(giftWrap.selectedQty))}<br/>
                Režim: ${escapeHtml(modeHuman)}<br/>
                ${linesHtml ? `Čo zabaliť:<br/>${linesHtml}<br/>` : ''}
                ${note ? `Poznámka: ${escapeHtml(note).replace(/\n/g,'<br/>')}` : ''}
              </p>
            `;
          })()
        : '';

      const adminBodyHtml = `
        <p><b>Objednávka č. ${invoiceNumber}, ID: ${order.id} </b> (${orderDate})</p>
        <p><b>Zákazník:</b><br/>
          Meno a priezvisko: ${escapeHtml(customer.name)}<br/>
          E-mail: ${escapeHtml(customer.email)}<br/>
          Telefón: ${escapeHtml(customer.phone || '')}<br/>
          Adresa: ${escapeHtml(addrLine || '-')}</p>
        <p>${escapeHtml(bodyAdminIntro)}</p>
        ${giftWrapAdminInline}
        <p><b>Položky (s EAN):</b><br/>
          ${productsWithEanHtml}
        </p>
      `;

      const adminEmailHtml = renderEmail({
        title: `Nová objednávka #${invoiceNumber}`,
        heading: `Nová objednávka #${invoiceNumber}`,
        bodyHtml: adminBodyHtml,
        cta: null,
        items: emailItems,
        shippingFee,
        paymentFee,
        totalWithShipping,
        deliverySummary,
        orderNotes,
        billingHtml,
        invoiceNumber,

        // ✅ gift wrap do emailu
        giftWrap,
      });

      const adminEmails = ['info@appdesign.sk', 'objednavky@majolika.sk', 'romana.uhercikova@majolika.sk', 'katarina.borisova@majolika.sk'];
      if (hasEventSession) {
        adminEmails.push('prehliadky@majolika.sk');
      }

      try {
        await sendEmail({ to: customer.email, subject, html: customerEmailHtml });
        await sendEmail({ to: 'majolika@majolika.sk', subject: `Nová objednávka #${invoiceNumber || String(order.id)}`, html: adminEmailHtml });

        await sendEmail({
          to: adminEmails.join(','),
          subject: `Nová objednávka #${invoiceNumber || String(order.id)}`,
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
