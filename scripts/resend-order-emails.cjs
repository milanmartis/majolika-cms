/**
 * Jednorazový skript na OPÄTOVNÉ odoslanie potvrdenia objednávky zákazníkovi.
 *
 * Použitie (z rootu projektu):
 *
 *   # DRY-RUN (nič neodošle, len vypíše, čo by poslal):
 *   node scripts/resend-order-emails.cjs 101 102 103
 *   node scripts/resend-order-emails.cjs --ids=101,102,103
 *
 *   # REÁLNE odoslanie (len zákazníkom, žiadny admin/KROS/faktúry):
 *   node scripts/resend-order-emails.cjs --ids=101,102,103 --send
 *
 *   # Pridať krátku vetu o dodatočnom zaslaní kvôli výpadku:
 *   node scripts/resend-order-emails.cjs --ids=101,102,103 --send --apology
 *
 *   # Prepísať cieľový email (test) – pošle VŠETKO na túto adresu:
 *   node scripts/resend-order-emails.cjs --ids=101 --send --to=milanmartis@gmail.com
 *
 * Poznámky:
 *   - Objednávky sa hľadajú podľa číselného `id` (nie invoiceNumber).
 *   - SMTP sa berie z .env (SMTP_HOST/PORT/USER/PASS, MAIL_FROM, MAIL_REPLY_TO) – rovnako ako src/utils/email.ts.
 *   - Odkaz "Zobraziť objednávku" používa RESEND_SITE_URL (default https://www.majolika.sk).
 */

'use strict';

const nodemailer = require('nodemailer');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

/* ----------------------------- CLI args ----------------------------- */
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--') && !a.includes('=')));
const kv = Object.fromEntries(
  argv
    .filter((a) => a.startsWith('--') && a.includes('='))
    .map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.join('=')];
    })
);

const SEND = flags.has('--send');           // bez tohto = dry-run
const APOLOGY = flags.has('--apology');     // pridať vetu o výpadku
const OVERRIDE_TO = kv.to || null;          // presmerovať všetko na 1 adresu (test)

const idsFromKv = (kv.ids || '')
  .split(',')
  .map((s) => Number(String(s).trim()))
  .filter((n) => Number.isFinite(n));

const idsFromPositional = argv
  .filter((a) => !a.startsWith('--'))
  .map((s) => Number(String(s).trim()))
  .filter((n) => Number.isFinite(n));

const ORDER_IDS = Array.from(new Set([...idsFromKv, ...idsFromPositional]));

const SITE_URL = (process.env.RESEND_SITE_URL || 'https://www.majolika.sk').replace(/\/$/, '');

/* ----------------------------- i18n ----------------------------- */
function normalizeLocale(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v.startsWith('en')) return 'en';
  if (v.startsWith('de')) return 'de';
  return 'sk';
}
const I18N = {
  sk: {
    shopWelcome: 'Vitajte v Majolike',
    subject: (n) => `Potvrdenie objednávky č. ${n}`,
    heading: (n) => `Potvrdenie objednávky č. ${n}`,
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
    subject: (n) => `Order confirmation no. ${n}`,
    heading: (n) => `Order confirmation no. ${n}`,
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
    subject: (n) => `Bestellbestätigung Nr. ${n}`,
    heading: (n) => `Bestellbestätigung Nr. ${n}`,
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
};
function t(locale) { return I18N[locale] || I18N.sk; }
function intlLocale(l) { return l === 'en' ? 'en-GB' : l === 'de' ? 'de-DE' : 'sk-SK'; }

/* ----------------------------- helpers ----------------------------- */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function money(n) { return `${Number(n || 0).toFixed(2)} €`; }
function isHttpUrl(u) { return typeof u === 'string' && /^https?:\/\//i.test(u); }
function formatDate(iso, locale) {
  const dt = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: 'Europe/Bratislava', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(dt);
}
function paymentHuman(method, TT) {
  return TT[`pay_${method}`] || String(method || '');
}
function summarizeDelivery(order, TT) {
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

function renderItemsRows(items) {
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

function renderEmail(order, TT, locale) {
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

  const apologyHtml = APOLOGY
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

/* ----------------------------- SMTP (rovnako ako src/utils/email.ts) ----------------------------- */
function makeTransport() {
  const host = process.env.SMTP_HOST || 'mail.webhouse.sk';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!user || !pass) throw new Error('Chýbajú SMTP údaje: nastav SMTP_USER a SMTP_PASS v .env');
  return { transporter: nodemailer.createTransport({ host, port, secure: false, auth: { user, pass } }), user };
}

async function main() {
  if (!ORDER_IDS.length) {
    console.error('❌ Nezadal si žiadne ID objednávky.\n   Príklad: node scripts/resend-order-emails.cjs --ids=101,102 --send');
    process.exit(1);
  }

  console.log(`\n${SEND ? '📤 REÁLNE ODOSLANIE' : '🔎 DRY-RUN (nič sa neodošle)'}`);
  console.log(`   Objednávky: ${ORDER_IDS.join(', ')}`);
  if (OVERRIDE_TO) console.log(`   ⚠️  Všetko presmerované na: ${OVERRIDE_TO}`);
  if (APOLOGY) console.log('   + ospravedlňujúca veta');
  console.log('');

  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'error'; // stíš Strapi logy

  const { transporter, user } = makeTransport();
  const from = process.env.MAIL_FROM || (user ? `"MAJOLIKA MODRA" <${user}>` : undefined);
  const replyTo = process.env.MAIL_REPLY_TO || undefined;

  let ok = 0, skipped = 0, failed = 0;

  for (const id of ORDER_IDS) {
    const order = await app.entityService.findOne('api::order.order', id, {
      populate: ['items', 'deliveryAddress', 'deliveryDetails', 'billingAddress'],
    });

    if (!order) { console.log(`  #${id}  ❌ NENÁJDENÁ`); skipped++; continue; }

    const to = OVERRIDE_TO || order.customerEmail;
    if (!to) { console.log(`  #${id}  ⚠️  bez emailu zákazníka – preskočené`); skipped++; continue; }

    const locale = normalizeLocale(order.orderLocale);
    const TT = t(locale);
    const num = order.invoiceNumber || String(order.id);
    const subject = TT.subject(num);

    console.log(
      `  #${id}  → ${to}  |  ${num}  |  ${money(order.totalWithShipping || order.total)}  |  ${order.paymentMethod}/${order.paymentStatus}`
    );

    if (!SEND) continue; // dry-run

    try {
      const html = renderEmail(order, TT, locale);
      const info = await transporter.sendMail({ from, to, subject, html, replyTo });
      console.log(`         ✅ odoslané (messageId=${info.messageId})`);
      // zapíš stav na objednávku (ako admin tlačidlo / checkout flow)
      await app.db.query('api::order.order').update({
        where: { id: order.id },
        data: {
          confirmationEmailStatus: 'sent',
          confirmationEmailSentAt: new Date(),
          confirmationEmailError: null,
          confirmationEmailMessageId: info.messageId || null,
        },
      }).catch(() => {});
      ok++;
    } catch (e) {
      console.log(`         ❌ CHYBA: ${e && e.message ? e.message : String(e)}`);
      await app.db.query('api::order.order').update({
        where: { id: order.id },
        data: { confirmationEmailStatus: 'failed', confirmationEmailError: String((e && e.message) || e) },
      }).catch(() => {});
      failed++;
    }
  }

  console.log('');
  if (SEND) console.log(`Hotovo: ✅ ${ok} odoslaných, ⚠️ ${skipped} preskočených, ❌ ${failed} chýb.`);
  else console.log(`Dry-run hotový. Pre reálne odoslanie pridaj --send.`);

  await app.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Skript zlyhal:', err);
  process.exit(1);
});
