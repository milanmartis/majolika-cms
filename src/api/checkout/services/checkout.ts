'use strict';
import { sendEmail } from '../../../utils/email';
import { recalcSessionsByTemporaryId, recalcSessionsByOrderId } from '../../../utils/sessions';
import { issueInvoiceForOrder } from "../../../utils/issue-invoice";


import crypto from 'crypto';

function makePublicToken() {
  return crypto.randomBytes(32).toString('hex'); // 64 znakov
}


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

/* ========================= i18n ========================= */

type AppLocale = 'sk' | 'en' | 'de';

function normalizeLocale(raw?: string | null): AppLocale {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'sk';
  if (v.startsWith('en')) return 'en';
  if (v.startsWith('de')) return 'de';
  if (v.startsWith('sk') || v.startsWith('cs')) return 'sk';
  return 'sk';
}


function intlLocale(locale: AppLocale): string {
  switch (locale) {
    case 'en': return 'en-GB';
    case 'de': return 'de-DE';
    case 'sk':
    default: return 'sk-SK';
  }
}

function siteLocaleLabel(locale: AppLocale): string {
  // HTML <html lang="">
  switch (locale) {
    case 'en': return 'en';
    case 'de': return 'de';
    case 'sk':
    default: return 'sk';
  }
}

const I18N = {
  sk: {
    shopWelcome: 'Vitajte v Majolike',

    hello: 'Dobrý deň,',
    thanksOrder: 'ďakujeme za Vašu objednávku v našom e-shope.',
    thanksOrderMajolika: 'ďakujeme za Vašu objednávku na našom e-shope majolika.sk.',
    moreInfoLater: 'O ďalšom priebehu Vás budeme informovať emailom.',

    orderDetails: 'Podrobnosti objednávky:',
    orderNumber: 'Číslo objednávky',
    date: 'Dátum',
    paymentMethod: 'Spôsob platby',
    deliveryMethod: 'Spôsob doručenia',

    payment_bank: 'bankový prevod',
    payment_cod: 'dobierka',
    payment_onsite: 'platba na mieste',
    payment_post: 'platba na pošte',
    payment_noncard: 'nekartová platba',

    delivery_pickup: 'osobný odber',
    delivery_post_office: 'pošta',
    delivery_packeta_box: 'Packeta',
    delivery_post_courier: 'kuriér',
    delivery_digital_product: 'digitálny produkt',

    deliverySummaryLabel: 'Doručenie:',
    orderSummary: 'Zhrnutie objednávky',
    item: 'Položka',
    totalCol: 'Spolu',
    shippingFee: 'Poplatok za dopravu',
    paymentFee: 'Poplatok za dobierku',
    total: 'Celkom',

    orderNoteTitle: 'Poznámka k objednávke',
    billingTitle: 'Fakturačné údaje',

    eventTerm: 'Termín',
    people: 'Osoby',

    badgeDigital: 'Digitálny produkt / darčekový poukaz',
    badgeGiftWrapSvc: 'Darčekové balenie (služba)',

    giftWrapTitle: 'Darčekové balenie',
    giftWrapCount: 'Počet balení',
    giftWrapHow: 'Ako zabaliť',
    giftWrapWhat: 'Čo zabaliť',
    giftWrapNote: 'Poznámka k baleniu',

    giftWrapMode_each_item: 'Každý kus zvlášť',
    giftWrapMode_by_product: 'Podľa produktov (jeden produkt = jeden balíček)',
    giftWrapMode_all_together: 'Všetko spolu (1 balíček)',

    urgency_rush: ' – objednávka ponáhľa',
    urgency_standard: ' – štandardná doba dodania (cca 2 týždne)',

    delivery_pickup_summary: 'Osobné vyzdvihnutie na mieste',
    delivery_post_office_prefix: 'Na poštu',
    delivery_packeta_prefix: 'Packeta/Carrier box',
    delivery_packeta_fallback: 'Packeta Box',
    delivery_courier_prefix: 'Kuriér na adresu',
    delivery_digital_summary: 'Digitálny produkt (bez fyzického doručenia)',

    bankTransferTitle: 'Platba bankovým prevodom',
    bankTransferIntro: 'Prosíme Vás o úhradu podľa nasledovných údajov:',
    bankTransferVs: 'Variabilný symbol',
    bankTransferAmount: 'Suma',
    bankTransferOutro: 'Objednávku začneme spracovávať hneď po pripísaní platby na náš účet.',

    viewOrder: 'Zobraziť objednávku',

    subjectConfirm: (num: string) => `Potvrdenie objednávky č. ${num}`,
    headingConfirm: (num: string) => `Potvrdenie objednávky č. ${num}`,
    subjectNewOrder: (num: string) => `Nová objednávka #${num}`,
    headingNewOrder: (num: string) => `Nová objednávka #${num}`,

    adminBlockTitle: (inv: string, id: string, date: string) => `Objednávka č. ${inv}, ID: ${id}  (${date})`,
    adminCustomer: 'Zákazník:',
    adminName: 'Meno a priezvisko',
    adminEmail: 'E-mail',
    adminPhone: 'Telefón',
    adminAddr: 'Adresa',
    adminItemsEan: 'Položky (s EAN):',
    adminPaymentPrefix: 'Platba:',
  },

  en: {
    shopWelcome: 'Welcome to Majolika',

    hello: 'Hello,',
    thanksOrder: 'thank you for your order in our online store.',
    thanksOrderMajolika: 'thank you for your order on majolika.sk.',
    moreInfoLater: 'We will keep you informed about the next steps by email.',

    orderDetails: 'Order details:',
    orderNumber: 'Order number',
    date: 'Date',
    paymentMethod: 'Payment method',
    deliveryMethod: 'Delivery method',

    payment_bank: 'bank transfer',
    payment_cod: 'cash on delivery',
    payment_onsite: 'pay on site',
    payment_post: 'pay at post office',
    payment_noncard: 'non-card payment',

    delivery_pickup: 'store pickup',
    delivery_post_office: 'post office',
    delivery_packeta_box: 'Packeta',
    delivery_post_courier: 'courier',
    delivery_digital_product: 'digital product',

    deliverySummaryLabel: 'Delivery:',
    orderSummary: 'Order summary',
    item: 'Item',
    totalCol: 'Total',
    shippingFee: 'Shipping fee',
    paymentFee: 'Cash on delivery fee',
    total: 'Grand total',

    orderNoteTitle: 'Order note',
    billingTitle: 'Billing details',

    eventTerm: 'Date/time',
    people: 'People',

    badgeDigital: 'Digital product / gift voucher',
    badgeGiftWrapSvc: 'Gift wrapping (service)',

    giftWrapTitle: 'Gift wrapping',
    giftWrapCount: 'Number of wraps',
    giftWrapHow: 'How to wrap',
    giftWrapWhat: 'What to wrap',
    giftWrapNote: 'Wrapping note',

    giftWrapMode_each_item: 'Each item separately',
    giftWrapMode_by_product: 'By products (one product = one package)',
    giftWrapMode_all_together: 'All together (1 package)',

    urgency_rush: ' – rush order',
    urgency_standard: ' – standard delivery time (approx. 2 weeks)',

    delivery_pickup_summary: 'Pickup at the store',
    delivery_post_office_prefix: 'To post office',
    delivery_packeta_prefix: 'Packeta/Carrier box',
    delivery_packeta_fallback: 'Packeta Box',
    delivery_courier_prefix: 'Courier to address',
    delivery_digital_summary: 'Digital product (no physical delivery)',

    bankTransferTitle: 'Payment by bank transfer',
    bankTransferIntro: 'Please pay using the following details:',
    bankTransferVs: 'Reference / variable symbol',
    bankTransferAmount: 'Amount',
    bankTransferOutro: 'We will start processing your order once the payment is credited to our account.',

    viewOrder: 'View order',

    subjectConfirm: (num: string) => `Order confirmation no. ${num}`,
    headingConfirm: (num: string) => `Order confirmation no. ${num}`,
    subjectNewOrder: (num: string) => `New order #${num}`,
    headingNewOrder: (num: string) => `New order #${num}`,

    adminBlockTitle: (inv: string, id: string, date: string) => `Order no. ${inv}, ID: ${id}  (${date})`,
    adminCustomer: 'Customer:',
    adminName: 'Full name',
    adminEmail: 'Email',
    adminPhone: 'Phone',
    adminAddr: 'Address',
    adminItemsEan: 'Items (with EAN):',
    adminPaymentPrefix: 'Payment:',
  },

  de: {
    shopWelcome: 'Willkommen bei Majolika',

    hello: 'Guten Tag,',
    thanksOrder: 'vielen Dank für Ihre Bestellung in unserem Online-Shop.',
    thanksOrderMajolika: 'vielen Dank für Ihre Bestellung auf majolika.sk.',
    moreInfoLater: 'Über den weiteren Ablauf informieren wir Sie per E-Mail.',

    orderDetails: 'Bestelldetails:',
    orderNumber: 'Bestellnummer',
    date: 'Datum',
    paymentMethod: 'Zahlungsart',
    deliveryMethod: 'Lieferart',

    payment_bank: 'Banküberweisung',
    payment_cod: 'Nachnahme',
    payment_onsite: 'Zahlung vor Ort',
    payment_post: 'Zahlung in der Postfiliale',
    payment_noncard: 'Zahlung ohne Karte',

    delivery_pickup: 'Abholung',
    delivery_post_office: 'Post',
    delivery_packeta_box: 'Packeta',
    delivery_post_courier: 'Kurier',
    delivery_digital_product: 'Digitalprodukt',

    deliverySummaryLabel: 'Lieferung:',
    orderSummary: 'Bestellübersicht',
    item: 'Artikel',
    totalCol: 'Summe',
    shippingFee: 'Versandkosten',
    paymentFee: 'Nachnahmegebühr',
    total: 'Gesamt',

    orderNoteTitle: 'Hinweis zur Bestellung',
    billingTitle: 'Rechnungsdaten',

    eventTerm: 'Termin',
    people: 'Personen',

    badgeDigital: 'Digitalprodukt / Gutschein',
    badgeGiftWrapSvc: 'Geschenkverpackung (Service)',

    giftWrapTitle: 'Geschenkverpackung',
    giftWrapCount: 'Anzahl der Verpackungen',
    giftWrapHow: 'Wie verpacken',
    giftWrapWhat: 'Was verpacken',
    giftWrapNote: 'Hinweis zur Verpackung',

    giftWrapMode_each_item: 'Jedes Stück einzeln',
    giftWrapMode_by_product: 'Nach Produkten (ein Produkt = ein Paket)',
    giftWrapMode_all_together: 'Alles zusammen (1 Paket)',

    urgency_rush: ' – Eilbestellung',
    urgency_standard: ' – Standardlieferzeit (ca. 2 Wochen)',

    delivery_pickup_summary: 'Abholung vor Ort',
    delivery_post_office_prefix: 'Zur Post',
    delivery_packeta_prefix: 'Packeta/Carrier Box',
    delivery_packeta_fallback: 'Packeta Box',
    delivery_courier_prefix: 'Kurier an die Adresse',
    delivery_digital_summary: 'Digitalprodukt (keine physische Lieferung)',

    bankTransferTitle: 'Zahlung per Banküberweisung',
    bankTransferIntro: 'Bitte überweisen Sie mit folgenden Angaben:',
    bankTransferVs: 'Referenz / variabler Symbol',
    bankTransferAmount: 'Betrag',
    bankTransferOutro: 'Wir beginnen mit der Bearbeitung Ihrer Bestellung, sobald die Zahlung auf unserem Konto gutgeschrieben ist.',

    viewOrder: 'Bestellung ansehen',

    subjectConfirm: (num: string) => `Bestellbestätigung Nr. ${num}`,
    headingConfirm: (num: string) => `Bestellbestätigung Nr. ${num}`,
    subjectNewOrder: (num: string) => `Neue Bestellung #${num}`,
    headingNewOrder: (num: string) => `Neue Bestellung #${num}`,

    adminBlockTitle: (inv: string, id: string, date: string) => `Bestellung Nr. ${inv}, ID: ${id}  (${date})`,
    adminCustomer: 'Kunde:',
    adminName: 'Name',
    adminEmail: 'E-Mail',
    adminPhone: 'Telefon',
    adminAddr: 'Adresse',
    adminItemsEan: 'Artikel (mit EAN):',
    adminPaymentPrefix: 'Zahlung:',
  },
} as const;

function t(locale: AppLocale) {
  return I18N[locale] || I18N.sk;
}

/* ========================= Format ========================= */

function formatEvent(event: EventInfo | undefined, locale: AppLocale): string {
  if (!event?.startDateTime) return '';
  const dt = new Date(event.startDateTime);

  const d = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: 'Europe/Bratislava',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dt);

  const tm = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: 'Europe/Bratislava',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);

  const people = typeof event.peopleCount === 'number'
    ? ` • ${t(locale).people}: ${event.peopleCount}`
    : '';

  return `${t(locale).eventTerm}: ${d}, ${tm}${people}`;
}

function formatNow(locale: AppLocale): string {
  const now = new Date();
  return new Intl.DateTimeFormat(intlLocale(locale), {
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

function renderItemsRows(
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
  }>,
  locale: AppLocale
) {
  const TT = t(locale);

  return items
    .map((it) => {
      const subtotal = it.unitPrice * it.quantity;

      const eventLine = it.event?.startDateTime
        ? `<div style="font-size:13px;color:#0e29a0;padding:4px 4px 0 4px;">${formatEvent(it.event, locale)}</div>`
        : '';

      const digitalBadge =
        it.isDigitalProduct || it.isGiftVoucher
          ? `<div style="font-size:12px;color:#0e29a0;padding:2px 4px 0 4px;">${escapeHtml(TT.badgeDigital)}</div>`
          : '';

      const giftWrapBadge =
        it.isGiftWrapProduct
          ? `<div style="font-size:12px;color:#0e29a0;padding:2px 4px 0 4px;">${escapeHtml(TT.badgeGiftWrapSvc)}</div>`
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
function renderGiftWrapHtml(gw: GiftWrapPayload | null | undefined, locale: AppLocale): string {
  if (!gw) return '';

  const TT = t(locale);

  const selected = Number(gw.selectedQty || 0);
  if (!Number.isFinite(selected) || selected <= 0) return '';

  const modeHuman =
    gw.mode === 'each_item' ? TT.giftWrapMode_each_item :
    gw.mode === 'by_product' ? TT.giftWrapMode_by_product :
    gw.mode === 'all_together' ? TT.giftWrapMode_all_together :
    String(gw.mode || '');

  const note = typeof gw.note === 'string' ? gw.note.trim() : '';
  const noteHtml = note
    ? `<div style="margin-top:8px;font-size:14px;color:#444;line-height:1.5;">
         <b>${escapeHtml(TT.giftWrapNote)}:</b><br/>
         ${escapeHtml(note).replace(/\n/g, '<br/>')}
       </div>`
    : '';

  // preferujeme lines (už obohatené o názvy), fallback: perProduct
  const hasLines = Array.isArray(gw.lines) && gw.lines.length > 0;
  const lines = (gw.lines || []).filter(l => Number(l.wrapQty || 0) > 0);

  const linesHtml = hasLines && lines.length
    ? `
      <div style="margin-top:10px;">
        <div style="font-weight:600;color:#333;margin-bottom:6px;">${escapeHtml(TT.giftWrapWhat)}:</div>
        <div style="font-size:14px;color:#444;line-height:1.6;">
          ${lines.map(l => {
            const nm = (l.productName || `Product #${l.productId}`) as string;
            const cartQty = Number(l.cartQty || 0);
            const wrapQty = Number(l.wrapQty || 0);
            const tail = cartQty > 0 ? ` / ${cartQty}` : '';
            // “wrap: X (of Y)” jazykovo nechávam neutrálne
            return `• ${escapeHtml(nm)} — <b>${wrapQty}</b>${tail}`;
          }).join('<br/>')}
        </div>
      </div>`
    : (Array.isArray(gw.perProduct) && gw.perProduct.length
      ? `
        <div style="margin-top:10px;">
          <div style="font-weight:600;color:#333;margin-bottom:6px;">${escapeHtml(TT.giftWrapWhat)}:</div>
          <div style="font-size:14px;color:#444;line-height:1.6;">
            ${gw.perProduct
              .filter(x => Number(x.wrapQty || 0) > 0)
              .map(x => `• Product #${escapeHtml(String(x.productId))} — <b>${escapeHtml(String(x.wrapQty))}</b>`)
              .join('<br/>')}
          </div>
        </div>`
      : '');

  return `
    <div style="margin:16px 0;padding:12px;border:1px solid #eaeaea;border-radius:0px;background:#fcfcfc;">
      <div style="font-weight:700;color:#0e29a0;margin-bottom:6px;">${escapeHtml(TT.giftWrapTitle)}</div>
      <div style="font-size:14px;color:#444;line-height:1.5;">
        <b>${escapeHtml(TT.giftWrapCount)}:</b> ${escapeHtml(String(selected))}<br/>
        <b>${escapeHtml(TT.giftWrapHow)}:</b> ${escapeHtml(modeHuman)}
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
  bodyHtml: string;
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
  giftWrap?: GiftWrapPayload | null;

  // ✅ nové
  locale: AppLocale;
}) {
  const TT = t(opts.locale);

  const itemsRows = renderItemsRows(opts.items, opts.locale);
  const giftWrapHtml = renderGiftWrapHtml(opts.giftWrap, opts.locale);

  const notesHtml = opts.orderNotes && String(opts.orderNotes).trim()
    ? `<div style="margin:16px 0;padding:12px;border:1px solid #eaeaea;border-radius:0px;background:#fcfcfc;">
         <div style="font-weight:600;color:#333;margin-bottom:6px;">${escapeHtml(TT.orderNoteTitle)}</div>
         <div style="font-size:14px;color:#444;line-height:1.5;">${escapeHtml(String(opts.orderNotes)).replace(/\n/g,'<br>')}</div>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="${siteLocaleLabel(opts.locale)}">
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
    <div class="header"><h1>${escapeHtml(TT.shopWelcome)}</h1></div>
    <div class="content">
      <h2>${opts.heading}</h2>
      ${opts.bodyHtml}

      <h3 style="color:#333;margin-top:32px;">${escapeHtml(TT.orderSummary)}</h3>
      <p style="font-size:14px;color:#666;margin:6px 0;"><b>${escapeHtml(TT.deliverySummaryLabel)}</b> ${opts.deliverySummary}</p>

      ${opts.billingHtml || ''}

      ${giftWrapHtml}

      ${notesHtml}

      <table role="presentation" aria-hidden="true" style="margin-top:8px;">
        <thead>
          <tr>
            <th>${escapeHtml(TT.item)}</th>
            <th style="text-align:right;">${escapeHtml(TT.totalCol)}</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
          <tr>
            <td style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${escapeHtml(TT.shippingFee)}</td>
            <td align="right" style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${money(opts.shippingFee)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${escapeHtml(TT.paymentFee)}</td>
            <td align="right" style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${money(opts.paymentFee)}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-top:1px solid #eee;font-weight:700;color:#111;">${escapeHtml(TT.total)}</td>
            <td align="right" style="padding:10px 12px;border-top:1px solid #eee;font-weight:700;color:#111;">${money(opts.totalWithShipping)}</td>
          </tr>
        </tbody>
      </table>

      ${
        opts.cta?.href
          ? `<a class="button" href="${opts.cta.href}" target="_blank">${escapeHtml(opts.cta.label || '')}</a>`
          : ''
      }
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
function renderBankTransferBlock(orderId: string | number, total: number, locale: AppLocale) {
  const TT = t(locale);

  const IBAN = 'SK97 0900 0000 0051 3558 7112 (Slovenská sporiteľňa)';
  const IBAN2 = 'SK17 0200 0000 0000 0241 9112 (VUB banka)';
  const vs = String(orderId);

  return `
    <div style="margin:20px 0;padding:16px;border:1px solid #e2e8f0;border-radius:0px;background:#f8fafc;">
      <div style="font-weight:700;color:#0e29a0;margin-bottom:8px;">${escapeHtml(TT.bankTransferTitle)}</div>
      <div style="line-height:1.7;color:#333;">
        ${escapeHtml(TT.bankTransferIntro)}<br/>
        • IBAN: ${IBAN}<br/>
        • IBAN: ${IBAN2}<br/>
        • ${escapeHtml(TT.bankTransferVs)}: ${escapeHtml(vs)}<br/>
        • ${escapeHtml(TT.bankTransferAmount)}: ${money(total)}<br/><br/>
        ${escapeHtml(TT.bankTransferOutro)}
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

function summarizeDelivery(delivery: Delivery, locale: AppLocale): string {
  const TT = t(locale);

  switch (delivery?.method) {
    case 'pickup':
      return TT.delivery_pickup_summary;

    case 'post_office': {
      const a = (delivery?.address || {}) as Address;
      const addrStr = [a.street, a.city, a.zip].filter(Boolean).join(', ');
      const id = delivery?.details?.postOfficeId;

      if (addrStr && id) {
        return `${TT.delivery_post_office_prefix}: ${addrStr} (ID: ${id})`;
      }
      if (addrStr) {
        return `${TT.delivery_post_office_prefix}: ${addrStr}`;
      }
      return `${TT.delivery_post_office_prefix} (ID: ${id || '-'})`;
    }

    case 'packeta_box':
      return delivery?.details?.notes
        ? `${TT.delivery_packeta_prefix}: ${delivery.details.notes}`
        : `${TT.delivery_packeta_fallback} (ID: ${delivery?.details?.packetaBoxId})`;

    case 'post_courier': {
      const a = delivery?.address || ({} as Address);
      return `${TT.delivery_courier_prefix}: ${a.street}, ${a.city} ${a.zip}, ${a.country}`;
    }

    case 'digital_product':
      return TT.delivery_digital_summary;

    default:
      return String(delivery?.method || '');
  }
}

function humanDelivery(deliveryMethod: DeliveryMethod, locale: AppLocale): string {
  const TT = t(locale);

  switch (deliveryMethod) {
    case 'pickup':
      return TT.delivery_pickup;
    case 'post_office':
      return TT.delivery_post_office;
    case 'packeta_box':
      return TT.delivery_packeta_box;
    case 'post_courier':
      return TT.delivery_post_courier;
    case 'digital_product':
      return TT.delivery_digital_product;
    default:
      return String(deliveryMethod);
  }
}

/* ========================= Service ========================= */

export default () => ({
  async createSession(payload: CheckoutPayload) {
    const FRONTEND_URL = process.env.FRONTEND_URL || '';
    if (!FRONTEND_URL) throw new Error('Missing FRONTEND_URL in environment variables.');

    const locale = normalizeLocale((payload as any)?.orderLocale ?? payload?.locale);
    const TT = t(locale);

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

      const perProduct = Array.isArray((gw as any).perProduct) ? (gw as any).perProduct : [];

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
      ? (existing as any)[0].id
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
        }) as any).id;

    const orderItems = await Promise.all(
      items.map(async (item: CheckoutItem) => {
        const product = await strapi.entityService.findOne('api::product.product', item.productId, {
          populate: {
            picture_new: { fields: ['url', 'formats'] },
            pictures_new: { fields: ['url', 'formats'] },
          },
        });

        if (!product || (typeof (product as any).price !== 'number' && typeof (product as any).price !== 'string')) {
          throw new Error(`Produkt s ID ${item.productId} neexistuje alebo nemá cenu.`);
        }

        const ean =
          (product as any).ean ||
          (product as any).eanCode ||
          (product as any).ean_code ||
          (product as any).ean_kod ||
          null;

        const isDigitalProduct =
          item.isDigitalProduct ??
          (product as any).isDigitalProduct ??
          false;

        const isGiftVoucher =
          item.isGiftVoucher ??
          (product as any).isGiftVoucher ??
          false;

        const isGiftWrapProduct = (item as any).isGiftWrapProduct === true;

        return {
          productId: item.productId,
          productName: item.productName ?? (product as any).name,
          slug: (product as any).slug,
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
        publicToken: makePublicToken(),
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

        items: orderItems.map(({ _image, event, ...rest }: any) => ({
          ...rest,
          imageUrl: absUrl(_image),
          event: event ? JSON.parse(JSON.stringify(event)) : null,
        })),

        orderStatus: 'pending',
        fulfillmentStatus,
        deliveryStatus,
        paymentMethod,
        paymentStatus,
        paymentSessionId: '',
        temporaryId: temporaryId || null,

        // ✅ uložíme aj locale do orderu (ak máš field; ak nemáš, nič to nepokazí len to ignorne)
        // @ts-ignore
        orderLocale: locale,

        ...billingDbData,
      } as any,
    });

    // 4A) NE-KARTA – prelinkuj bookingy + pošli emaily + redirect na success
    if (!isCard) {
      try {
        if ((order as any).temporaryId) {
          const res = await strapi.db.query('api::event-booking.event-booking').updateMany({
            where: { temporaryId: (order as any).temporaryId, orderId: null },
            data: {
              orderId: String((order as any).id),
              status: 'confirmed',
              customerEmail: customer.email,
              customerName: customer.name,
              customerPhone: customer.phone,
            },
          });
          strapi.log.info(`[CHECKOUT][BOOKINGS][NON-CARD] linked by temporaryId (${res.count}) → orderId=${(order as any).id}`);
        }
      } catch (e) {
        strapi.log.warn(`[CHECKOUT][BOOKINGS][NON-CARD] linking failed: ${String(e)}`);
      }

      try {
        if ((order as any).temporaryId) await recalcSessionsByTemporaryId((order as any).temporaryId);
        await recalcSessionsByOrderId((order as any).id);
      } catch (e) {
        strapi.log.error('[GCAL][NON-CARD] recalc failed:', e);
      }

      let invoiceNumber: string | null = null;
      let invoiceUrl: string | null = null;

      try {
        const inv = await issueInvoiceForOrder((order as any).id);
        invoiceNumber = inv?.invoiceNumber || null;
        // invoiceUrl = inv?.invoiceUrl || inv?.url || null;

        if (invoiceNumber || invoiceUrl) {
          await strapi.entityService.update('api::order.order', (order as any).id, {
            data: {
              invoiceNumber: invoiceNumber,
              invoiceUrl: invoiceUrl
            } as any
          });
        }
      } catch (e) {
        strapi.log.error('[INVOICE][NON-CARD] issue failed:', e);
      }

      const baseDeliverySummary = summarizeDelivery(delivery, locale);
      const urgencySuffix =
        deliveryUrgency === 'rush'
          ? TT.urgency_rush
          : TT.urgency_standard;
      const deliverySummary = `${baseDeliverySummary}${urgencySuffix}`;

      const emailItems = orderItems.map((i: any) => ({
        productName: i.productName,
        slug: i.slug,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        image: i._image,
        event: i.event,

        isDigitalProduct: !!i.isDigitalProduct || !!i.isGiftVoucher,
        isGiftVoucher: !!i.isGiftVoucher,
        isGiftWrapProduct: !!i.isGiftWrapProduct,
      }));

      const billingHtml =
        billing && billing.isCompany
          ? `
            <div style="margin:16px 0;padding:12px;border:1px solid #eaeaea;border-radius:0px;background:#fcfcfc;">
              <div style="font-weight:600;color:#333;margin-bottom:6px;">${escapeHtml(TT.billingTitle)}</div>
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

      const orderNo = (order as any).id;
      const orderDate = formatNow(locale);
      const deliveryHuman = humanDelivery(deliveryMethod, locale);
      const numberForEmail = String(invoiceNumber || orderNo);

      const subject = TT.subjectConfirm(numberForEmail);

      let bodyCustomerHtml = '';
      let bodyAdminIntro = '';

      if (paymentMethod === 'bank') {
        bodyCustomerHtml = `
          <p>${escapeHtml(TT.hello)}</p>
          <p>${escapeHtml(TT.thanksOrder)}</p>
          <p><b>${escapeHtml(TT.orderDetails)}</b><br/>
          • ${escapeHtml(TT.orderNumber)}: ${escapeHtml(numberForEmail)}<br/>
          • ${escapeHtml(TT.date)}: ${escapeHtml(orderDate)}<br/>
          • ${escapeHtml(TT.paymentMethod)}: ${escapeHtml(TT.payment_bank)}<br/>
          • ${escapeHtml(TT.deliveryMethod)}: ${escapeHtml(deliveryHuman)}</p>
          ${renderBankTransferBlock(orderNo, totalWithShipping, locale)}
        `;
        bodyAdminIntro = `${TT.adminPaymentPrefix} ${TT.payment_bank}`;
      } else {
        const pmHuman =
          paymentMethod === 'cod' ? TT.payment_cod :
          paymentMethod === 'onsite' ? TT.payment_onsite :
          paymentMethod === 'post' ? TT.payment_post :
          TT.payment_noncard;

        bodyCustomerHtml = `
          <p>${escapeHtml(TT.hello)}</p>
          <p>${escapeHtml(TT.thanksOrderMajolika)}</p>
          <p><b>${escapeHtml(TT.orderDetails)}</b><br/>
          • ${escapeHtml(TT.orderNumber)}: ${escapeHtml(numberForEmail)}<br/>
          • ${escapeHtml(TT.date)}: ${escapeHtml(orderDate)}<br/>
          • ${escapeHtml(TT.paymentMethod)}: ${escapeHtml(pmHuman)}<br/>
          • ${escapeHtml(TT.deliveryMethod)}: ${escapeHtml(deliveryHuman)}</p>
          <p>${escapeHtml(TT.moreInfoLater)}</p>
        `;
        bodyAdminIntro = `${TT.adminPaymentPrefix} ${pmHuman}`;
      }

      const customerEmailHtml = renderEmail({
        title: subject,
        heading: TT.headingConfirm(numberForEmail),
        bodyHtml: bodyCustomerHtml,
        cta: { label: TT.viewOrder, href: `${FRONTEND_URL}/checkout/success?order=${(order as any).id}` },
        items: emailItems,
        shippingFee,
        paymentFee,
        totalWithShipping,
        deliverySummary,
        orderNotes,
        billingHtml,
        invoiceNumber,

        giftWrap,
        locale,
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

      const giftWrapAdminInline = giftWrap && Number(giftWrap.selectedQty || 0) > 0
        ? (() => {
            const modeHuman =
              giftWrap.mode === 'each_item' ? TT.giftWrapMode_each_item :
              giftWrap.mode === 'by_product' ? TT.giftWrapMode_by_product :
              giftWrap.mode === 'all_together' ? TT.giftWrapMode_all_together :
              String(giftWrap.mode || '');

            const lines = Array.isArray(giftWrap.lines) ? giftWrap.lines.filter(l => Number(l.wrapQty || 0) > 0) : [];
            const linesHtml = lines.length
              ? lines.map(l => `• ${escapeHtml(String(l.productName || `Produkt #${l.productId}`))} — ${escapeHtml(String(l.wrapQty))}${l.cartQty ? ` / ${escapeHtml(String(l.cartQty))}` : ''}`).join('<br/>')
              : '';

            const note = typeof giftWrap.note === 'string' ? giftWrap.note.trim() : '';
            return `
              <p><b>${escapeHtml(TT.giftWrapTitle)}:</b><br/>
                ${escapeHtml(TT.giftWrapCount)}: ${escapeHtml(String(giftWrap.selectedQty))}<br/>
                ${escapeHtml(TT.giftWrapHow)}: ${escapeHtml(modeHuman)}<br/>
                ${linesHtml ? `${escapeHtml(TT.giftWrapWhat)}:<br/>${linesHtml}<br/>` : ''}
                ${note ? `${escapeHtml(TT.giftWrapNote)}: ${escapeHtml(note).replace(/\n/g,'<br/>')}` : ''}
              </p>
            `;
          })()
        : '';

      const adminBodyHtml = `
        <p><b>${escapeHtml(TT.adminBlockTitle(numberForEmail, String((order as any).id), orderDate))}</b></p>
        <p><b>${escapeHtml(TT.adminCustomer)}</b><br/>
          ${escapeHtml(TT.adminName)}: ${escapeHtml(customer.name)}<br/>
          ${escapeHtml(TT.adminEmail)}: ${escapeHtml(customer.email)}<br/>
          ${escapeHtml(TT.adminPhone)}: ${escapeHtml(customer.phone || '')}<br/>
          ${escapeHtml(TT.adminAddr)}: ${escapeHtml(addrLine || '-')}</p>
        <p>${escapeHtml(bodyAdminIntro)}</p>
        ${giftWrapAdminInline}
        <p><b>${escapeHtml(TT.adminItemsEan)}</b><br/>
          ${productsWithEanHtml}
        </p>
      `;

      const adminEmailHtml = renderEmail({
        title: TT.subjectNewOrder(numberForEmail),
        heading: TT.headingNewOrder(numberForEmail),
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

        giftWrap,
        locale,
      });

      const adminEmails = ['info@appdesign.sk', 'objednavky@majolika.sk', 'romana.uhercikova@majolika.sk', 'katarina.borisova@majolika.sk'];
      if (hasEventSession) {
        adminEmails.push('prehliadky@majolika.sk');
      }

      try {
        await sendEmail({ to: customer.email, subject, html: customerEmailHtml });

        await sendEmail({
          to: 'majolika@majolika.sk',
          subject: TT.subjectNewOrder(numberForEmail),
          html: adminEmailHtml
        });

        await sendEmail({
          to: adminEmails.join(','),
          subject: TT.subjectNewOrder(numberForEmail),
          html: adminEmailHtml,
        });

      } catch (e) {
        strapi.log.error('[ORDER][EMAIL][NON-CARD] send failed:', e);
      }

      return { checkoutUrl: `${FRONTEND_URL}/checkout/success?order=${(order as any).id}`, sessionUrl: null };
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
        price: String(Math.round(totalWithShipping * 100)),
        label: clampLabel('Order'),
        refId: String((order as any).id),
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

      if ((parsed as any).code !== '0') {
        strapi.log.error('[COMGATE][CREATE] error:', parsed);
        throw new Error((parsed as any).message || 'Comgate create error');
      }

      try {
        await strapi.db.query('api::order.order').update({
          where: { id: (order as any).id },
          data: { comgateTransId: (parsed as any).transId, paymentStatus: 'unpaid' },
        });
      } catch (e) {
        strapi.log.warn(`[COMGATE][CREATE] persist transId failed for order #${(order as any).id}: ${String(e)}`);
      }

      return {
        checkoutUrl: decodeURIComponent((parsed as any).redirect),
        sessionUrl: null,
        orderId: (order as any).id,
        totalWithShippingCents: Math.round(totalWithShipping * 100),
      };
    }
  },
});