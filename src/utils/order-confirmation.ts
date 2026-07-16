// src/utils/order-confirmation.ts
// Zdieľaná logika na OPÄTOVNÉ poskladanie a odoslanie potvrdenia objednávky
// z uložených dát (DB). Používa ju resend endpoint (admin tlačidlo) aj skript.
import { sendEmail } from './email';

declare const strapi: any;

type AppLocale = 'sk' | 'en' | 'de';

export function normalizeLocale(raw?: any): AppLocale {
  const v = String(raw || '').trim().toLowerCase();
  if (v.startsWith('en')) return 'en';
  if (v.startsWith('de')) return 'de';
  return 'sk';
}

const I18N = {
  sk: {
    shopWelcome: 'Vitajte v Majolike',
    subject: (n: string) => `Potvrdenie objednávky č. ${n}`,
    heading: (n: string) => `Potvrdenie objednávky č. ${n}`,
    hello: 'Dobrý deň,',
    thanks: 'ďakujeme za Vašu objednávku na našom e-shope majolika.sk.',
    apology:
      'Toto potvrdenie Vám zasielame dodatočne – kvôli krátkodobému technickému výpadku sa pôvodný email neodoslal. Za komplikácie sa ospravedlňujeme.',
    orderDetails: 'Podrobnosti objednávky:',
    orderNumber: 'Číslo objednávky',
    date: 'Dátum',
    paymentMethod: 'Spôsob platby',
    deliveryMethod: 'Spôsob doručenia',
    orderSummary: 'Zhrnutie objednávky',
    deliveryLabel: 'Doručenie:',
    item: 'Položka',
    totalCol: 'Spolu',
    shippingFee: 'Poplatok za dopravu',
    paymentFee: 'Poplatok za dobierku',
    total: 'Celkom',
    orderNoteTitle: 'Poznámka k objednávke',
    viewOrder: 'Zobraziť objednávku',
    pay_card: 'platba kartou', pay_cod: 'dobierka', pay_bank: 'bankový prevod', pay_onsite: 'platba na mieste', pay_post: 'platba na pošte',
    del_pickup: 'osobný odber', del_post_office: 'pošta', del_packeta_box: 'Packeta', del_post_courier: 'kuriér', del_digital_product: 'digitálny produkt',
  },
  en: {
    shopWelcome: 'Welcome to Majolika',
    subject: (n: string) => `Order confirmation no. ${n}`,
    heading: (n: string) => `Order confirmation no. ${n}`,
    hello: 'Hello,',
    thanks: 'thank you for your order on majolika.sk.',
    apology:
      'We are sending you this confirmation additionally – due to a short technical outage the original email was not delivered. We apologise for any inconvenience.',
    orderDetails: 'Order details:',
    orderNumber: 'Order number',
    date: 'Date',
    paymentMethod: 'Payment method',
    deliveryMethod: 'Delivery method',
    orderSummary: 'Order summary',
    deliveryLabel: 'Delivery:',
    item: 'Item',
    totalCol: 'Total',
    shippingFee: 'Shipping fee',
    paymentFee: 'Cash on delivery fee',
    total: 'Grand total',
    orderNoteTitle: 'Order note',
    viewOrder: 'View order',
    pay_card: 'card payment', pay_cod: 'cash on delivery', pay_bank: 'bank transfer', pay_onsite: 'pay on site', pay_post: 'pay at post office',
    del_pickup: 'store pickup', del_post_office: 'post office', del_packeta_box: 'Packeta', del_post_courier: 'courier', del_digital_product: 'digital product',
  },
  de: {
    shopWelcome: 'Willkommen bei Majolika',
    subject: (n: string) => `Bestellbestätigung Nr. ${n}`,
    heading: (n: string) => `Bestellbestätigung Nr. ${n}`,
    hello: 'Guten Tag,',
    thanks: 'vielen Dank für Ihre Bestellung auf majolika.sk.',
    apology:
      'Diese Bestätigung senden wir Ihnen nachträglich – aufgrund einer kurzen technischen Störung wurde die ursprüngliche E-Mail nicht zugestellt. Wir entschuldigen uns für die Unannehmlichkeiten.',
    orderDetails: 'Bestelldetails:',
    orderNumber: 'Bestellnummer',
    date: 'Datum',
    paymentMethod: 'Zahlungsart',
    deliveryMethod: 'Lieferart',
    orderSummary: 'Bestellübersicht',
    deliveryLabel: 'Lieferung:',
    item: 'Artikel',
    totalCol: 'Summe',
    shippingFee: 'Versandkosten',
    paymentFee: 'Nachnahmegebühr',
    total: 'Gesamt',
    orderNoteTitle: 'Hinweis zur Bestellung',
    viewOrder: 'Bestellung ansehen',
    pay_card: 'Kartenzahlung', pay_cod: 'Nachnahme', pay_bank: 'Banküberweisung', pay_onsite: 'Zahlung vor Ort', pay_post: 'Zahlung in der Postfiliale',
    del_pickup: 'Abholung', del_post_office: 'Post', del_packeta_box: 'Packeta', del_post_courier: 'Kurier', del_digital_product: 'Digitalprodukt',
  },
} as const;

function t(locale: AppLocale) { return I18N[locale] || I18N.sk; }
function intlLocale(l: AppLocale) { return l === 'en' ? 'en-GB' : l === 'de' ? 'de-DE' : 'sk-SK'; }

function esc(s?: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function money(n: any) { return `${Number(n || 0).toFixed(2)} €`; }
function isHttpUrl(u?: any) { return typeof u === 'string' && /^https?:\/\//i.test(u); }
function formatDate(iso: any, locale: AppLocale) {
  const dt = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: 'Europe/Bratislava', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(dt);
}
function paymentHuman(method: any, TT: any) { return TT[`pay_${method}`] || String(method || ''); }

function summarizeDelivery(order: any, TT: any) {
  const d = order.deliveryDetails || {};
  const a = order.deliveryAddress || {};
  switch (order.deliveryMethod) {
    case 'pickup': return TT.del_pickup;
    case 'post_office': {
      const addr = [a.street, a.city, a.zip].filter(Boolean).join(', ');
      return addr ? `${TT.del_post_office}: ${addr}` : `${TT.del_post_office} (ID: ${d.postOfficeId || '-'})`;
    }
    case 'packeta_box':
      return d.notes ? `${TT.del_packeta_box}: ${d.notes}` : `${TT.del_packeta_box} (ID: ${d.packetaBoxId || '-'})`;
    case 'post_courier':
      return `${TT.del_post_courier}: ${[a.street, a.city, a.zip, a.country].filter(Boolean).join(', ')}`;
    case 'digital_product': return TT.del_digital_product;
    default: return String(order.deliveryMethod || '');
  }
}

function renderItemsRows(items: any[]) {
  return (items || []).map((it) => {
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unitPrice || 0);
    const subtotal = unit * qty;
    const img = isHttpUrl(it.imageUrl)
      ? `<img src="${esc(it.imageUrl)}" alt="" width="64" height="64" style="object-fit:cover;" />`
      : '<img src="https://www.majolika.sk/assets/img/logo-SLM-modre.gif" alt="" width="64" height="64" style="object-fit:cover;" />';
    const nameHtml = it.slug
      ? `<a href="https://www.majolika.sk/produkt/${esc(it.slug)}" style="color:#0e29a0;text-decoration:none;" target="_blank">${esc(it.productName)}</a>`
      : esc(it.productName);
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${img}
            <div>
              <div style="font-weight:600;color:#333;padding:4px;">${nameHtml}</div>
              <div style="font-size:13px;color:#777;padding:4px;">${money(unit)} × ${qty}</div>
            </div>
          </div>
        </td>
        <td align="right" style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;color:#333;">${money(subtotal)}</td>
      </tr>`;
  }).join('');
}

const SITE_URL = (process.env.RESEND_SITE_URL || process.env.FRONTEND_URL || 'https://www.majolika.sk').replace(/\/$/, '');

/** Poskladá HTML potvrdenia objednávky z ULOŽENÝCH dát (order + populate items/adresy). */
export function buildOrderConfirmationHtml(order: any, opts: { apology?: boolean } = {}): string {
  const locale = normalizeLocale(order.orderLocale);
  const TT = t(locale);
  const num = order.invoiceNumber || String(order.id);

  const shippingFee = Number(order.shippingFee || 0);
  const paymentFee = Number(order.paymentFee || 0);
  const totalWithShipping = order.totalWithShipping != null
    ? Number(order.totalWithShipping)
    : Number((Number(order.total || 0) + shippingFee + paymentFee).toFixed(2));

  const notes = (order.notes || '').trim();
  const notesHtml = notes
    ? `<div style="margin:16px 0;padding:12px;border:1px solid #eaeaea;background:#fcfcfc;">
         <div style="font-weight:600;color:#333;margin-bottom:6px;">${esc(TT.orderNoteTitle)}</div>
         <div style="font-size:14px;color:#444;line-height:1.5;">${esc(notes).replace(/\n/g, '<br>')}</div>
       </div>`
    : '';

  const apologyHtml = opts.apology
    ? `<p style="background:#fff8e1;border:1px solid #ffe0a3;padding:12px;color:#5f4300;">${esc(TT.apology)}</p>`
    : '';

  const detailsHtml = `
    <p>${esc(TT.hello)}</p>
    <p>${esc(TT.thanks)}</p>
    ${apologyHtml}
    <p><b>${esc(TT.orderDetails)}</b><br/>
      • ${esc(TT.orderNumber)}: ${esc(num)}<br/>
      • ${esc(TT.date)}: ${esc(formatDate(order.createdAt, locale))}<br/>
      • ${esc(TT.paymentMethod)}: ${esc(paymentHuman(order.paymentMethod, TT))}<br/>
      • ${esc(TT.deliveryMethod)}: ${esc(summarizeDelivery(order, TT))}
    </p>`;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="UTF-8" /><title>${esc(TT.subject(num))}</title>
<style>
  body { font-family: Arial, sans-serif; background:#f5f5f5; margin:0; padding:0; }
  .container { max-width:600px; margin:40px auto; background:#fff; box-shadow:0 0 10px rgba(0,0,0,0.05); overflow:hidden; }
  .header { background:#0e29a0; color:#fff; padding:24px; text-align:center; }
  .content { padding:32px; }
  .content p { font-size:16px; line-height:1.6; color:#444; }
  .button { display:inline-block; margin-top:24px; padding:12px 24px; background:#0e29a0; color:#fff !important; text-decoration:none; font-weight:bold; }
  .footer { background:#fafafa; color:#777; font-size:13px; padding:24px; text-align:center; line-height:1.5; }
  .footer a { color:#0e29a0; text-decoration:none; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:12px; color:#666; padding:6px 12px; }
</style></head>
<body>
  <div class="container">
    <div class="header"><h1>${esc(TT.shopWelcome)}</h1></div>
    <div class="content">
      <h2>${esc(TT.heading(num))}</h2>
      ${detailsHtml}
      <h3 style="color:#333;margin-top:32px;">${esc(TT.orderSummary)}</h3>
      <p style="font-size:14px;color:#666;margin:6px 0;"><b>${esc(TT.deliveryLabel)}</b> ${esc(summarizeDelivery(order, TT))}</p>
      ${notesHtml}
      <table role="presentation" aria-hidden="true" style="margin-top:8px;">
        <thead><tr><th>${esc(TT.item)}</th><th style="text-align:right;">${esc(TT.totalCol)}</th></tr></thead>
        <tbody>
          ${renderItemsRows(order.items)}
          <tr><td style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${esc(TT.shippingFee)}</td>
              <td align="right" style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${money(shippingFee)}</td></tr>
          <tr><td style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${esc(TT.paymentFee)}</td>
              <td align="right" style="padding:8px 12px;border-top:2px solid #eee;color:#333;">${money(paymentFee)}</td></tr>
          <tr><td style="padding:10px 12px;border-top:1px solid #eee;font-weight:700;color:#111;">${esc(TT.total)}</td>
              <td align="right" style="padding:10px 12px;border-top:1px solid #eee;font-weight:700;color:#111;">${money(totalWithShipping)}</td></tr>
        </tbody>
      </table>
      <p style="text-align:center;">
        <a class="button" href="${SITE_URL}/checkout/success?order=${order.id}" target="_blank">${esc(TT.viewOrder)}</a>
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
      <p style="margin-top:18px;padding-top:18px;border-top:1px solid #e5e5e5;">
        <a href="https://www.majolika.sk/odstupenie-od-zmluvy" target="_blank" style="font-weight:bold;color:#0e29a0;">
          Odstúpenie od zmluvy | Contract termination
        </a>
      </p>
      <div class="footer-logo">
        <a href="https://www.majolika.sk"><img src="https://www.majolika.sk/assets/img/logo-SLM-modre.gif" border="0" alt="SLM logo" width="200" /></a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

type ConfirmResult =
  | { status: 'sent'; messageId: string | null }
  | { status: 'skipped'; reason: string };

/** Zapíše stav potvrdzujúceho emailu na objednávku (ako pri KROS). */
export async function recordConfirmationEmailStatus(
  orderId: number,
  data: { status: 'sent' | 'failed'; messageId?: string | null; error?: string | null }
) {
  try {
    await strapi.db.query('api::order.order').update({
      where: { id: orderId },
      data: {
        confirmationEmailStatus: data.status,
        confirmationEmailSentAt: data.status === 'sent' ? new Date() : undefined,
        confirmationEmailError: data.status === 'sent' ? null : (data.error ?? null),
        confirmationEmailMessageId: data.messageId ?? undefined,
      },
    });
  } catch (e) {
    strapi.log?.warn?.(`[ORDER][EMAIL][STATUS] failed to persist for order #${orderId}: ${String(e)}`);
  }
}

/**
 * Poskladá a odošle potvrdenie zákazníkovi z uloženej objednávky a zapíše stav.
 * `opts.to` presmeruje email (test) – inak ide na order.customerEmail.
 */
export async function sendAndRecordConfirmation(
  order: any,
  opts: { apology?: boolean; to?: string } = {}
): Promise<ConfirmResult> {
  const locale = normalizeLocale(order.orderLocale);
  const TT = t(locale);
  const num = order.invoiceNumber || String(order.id);
  const subject = TT.subject(num);
  const to = opts.to || order.customerEmail;

  if (!to) return { status: 'skipped', reason: 'no-email' };

  const html = buildOrderConfirmationHtml(order, { apology: opts.apology });

  try {
    const info: any = await sendEmail({ to, subject, html });
    await recordConfirmationEmailStatus(order.id, { status: 'sent', messageId: info?.messageId ?? null });
    return { status: 'sent', messageId: info?.messageId ?? null };
  } catch (e: any) {
    await recordConfirmationEmailStatus(order.id, { status: 'failed', error: String(e?.message || e) });
    throw e;
  }
}
