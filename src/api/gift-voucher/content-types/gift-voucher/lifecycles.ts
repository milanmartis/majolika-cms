import fs from 'fs/promises';
import path from 'path';
import { sendEmail } from '../../../../utils/email';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

declare const strapi: any;

const POUKAZY_DIR = process.env.POUKAZY_DIR || path.join(process.cwd(), 'poukazy');
const PDF_LABELS: Record<string, { code: string; validUntil: string }> = {
  sk: {
    code: 'Kód poukážky:',
    validUntil: 'Platnosť:',
  },
  en: {
    code: 'Voucher number:',
    validUntil: 'Valid until:',
  },
  de: {
    code: 'Gutscheinnummer:',
    validUntil: 'Gültig bis:',
  },
};

const PDF_BY_PRODUCT_SLUG: Record<
  string,
  {
    file: string;
    labelCode: { x: number; y: number };
    valueCode: { x: number; y: number };
    labelValidUntil: { x: number; y: number };
    valueValidUntil: { x: number; y: number };
    labelFontSize?: number;
    valueFontSize?: number;
  }
> = {
  'darcekova-poukazka-30e': {
    file: 'darcekovy poukaz v hodnote 30e.pdf',
    labelCode: { x: 82, y: 355 },
    valueCode: { x: 82, y: 280 },
    labelValidUntil: { x: 600, y: 355 },
    valueValidUntil: { x: 600, y: 280 },
    labelFontSize: 27,
    valueFontSize: 48,
  },

  'darcekova-poukazka-50e': {
    file: 'Darcekova poukazka Majolika 50e_nakup.pdf',
    labelCode: { x: 82, y: 355 },
    valueCode: { x: 82, y: 280 },
    labelValidUntil: { x: 600, y: 355 },
    valueValidUntil: { x: 600, y: 280 },
    labelFontSize: 27,
    valueFontSize: 48,
  },

  'darcekova-poukazka-100e': {
    file: 'Darcekova poukazka Majolika100e_nakup.pdf',
    labelCode: { x: 82, y: 355 },
    valueCode: { x: 82, y: 280 },
    labelValidUntil: { x: 600, y: 355 },
    valueValidUntil: { x: 600, y: 280 },
    labelFontSize: 27,
    valueFontSize: 48,
  },

  'darcekovy-poukaz-malovanie-dvoch-salok': {
    file: 'Dva hrnčeky.pdf',
    labelCode: { x: 575, y: 120 },
    valueCode: { x: 575, y: 90 },
    labelValidUntil: { x: 575, y: 65 },
    valueValidUntil: { x: 780, y: 65 },
    labelFontSize: 14,
    valueFontSize: 33,
  },

  'darcekovy-poukaz-tvorenie-z-hliny-a-malovanie-vlastnorucne-vyrobenej-keramiky': {
    file: 'Hlina a malovanie, dvojdielny tvor poukaz.pdf',
    labelCode: { x: 190, y: 95 },
    valueCode: { x: 190, y: 78 },
    labelValidUntil: { x: 320, y: 50 },
    valueValidUntil: { x: 320, y: 40 },
    labelFontSize: 9,
    valueFontSize: 15,
  },

  'darcekovy-poukaz-tvorenie-s-hlinou-tlacena-verzia': {
    file: 'Hlina poukaz.pdf',
    labelCode: { x: 620, y: 170 },
    valueCode: { x: 620, y: 134 },
    labelValidUntil: { x: 620, y: 100 },
    valueValidUntil: { x: 620, y: 80 },
    labelFontSize: 14,
    valueFontSize: 29,
  },

  'darcekovy-poukaz-tvorenie-s-hlinou-elektronicky': {
    file: 'Hlina poukaz.pdf',
    labelCode: { x: 620, y: 170 },
    valueCode: { x: 620, y: 134 },
    labelValidUntil: { x: 620, y: 100 },
    valueValidUntil: { x: 620, y: 80 },
    labelFontSize: 14,
    valueFontSize: 29,
  },

  'darcekovy-poukaz-malovanie-hrnceka-a-misky': {
    file: 'Miska_a_hrncek_darcekovy_poukaz.pdf',
    labelCode: { x: 275, y: 149 },
    valueCode: { x: 275, y: 120 },
    labelValidUntil: { x: 275, y: 90 },
    valueValidUntil: { x: 275, y: 73 },
    labelFontSize: 14,
    valueFontSize: 27,
  },

  'prehliadka-vyroby-a-malovanie-keramiky': {
    file: 'Prehliadky a malovanie keramiky darcekovy poukaz.pdf',
    labelCode: { x: 360, y: 148 },
    valueCode: { x: 360, y: 120 },
    labelValidUntil: { x: 360, y: 92 },
    valueValidUntil: { x: 360, y: 78 },
    labelFontSize: 14,
    valueFontSize: 27,
  },

  'prehliadka-vyroby': {
    file: 'Prehliadky vyroby.pdf',
    labelCode: { x: 360, y: 148 },
    valueCode: { x: 360, y: 120 },
    labelValidUntil: { x: 360, y: 92 },
    valueValidUntil: { x: 360, y: 78 },
    labelFontSize: 14,
    valueFontSize: 27,
  },

  'darcekovy-poukaz-malovanie-salky-s-podsalkou': {
    file: 'Šálka s podsalkou.pdf',
    labelCode: { x: 565, y: 128 },
    valueCode: { x: 565, y: 104 },
    labelValidUntil: { x: 565, y: 76 },
    valueValidUntil: { x: 565, y: 60 },
    labelFontSize: 14,
    valueFontSize: 27,
  },

  'vaza-a-pohar-elektronicky': {
    file: 'Váza a pohár vsetky udaje darcekovy poukaz.pdf',
    labelCode: { x: 390, y: 130 },
    valueCode: { x: 390, y: 107 },
    labelValidUntil: { x: 390, y: 82 },
    valueValidUntil: { x: 390, y: 66 },
    labelFontSize: 14,
    valueFontSize: 27,
  },

  'darcekovy-poukaz-vaza-a-pohar-fyzicky': {
    file: 'Váza a pohár vsetky udaje darcekovy poukaz.pdf',
    labelCode: { x: 390, y: 130 },
    valueCode: { x: 390, y: 107 },
    labelValidUntil: { x: 390, y: 82 },
    valueValidUntil: { x: 390, y: 66 },
    labelFontSize: 14,
    valueFontSize: 27,
  },
};

function normalizeLocale(locale?: string | null) {
  const l = String(locale || 'sk').toLowerCase();

  if (l.startsWith('en')) return 'en';
  if (l.startsWith('de')) return 'de';

  return 'sk';
}

function getDateLocale(locale: string) {
  if (locale === 'en') return 'en-GB';
  if (locale === 'de') return 'de-DE';

  return 'sk-SK';
}

async function createFilledVoucherPdf(voucher: any) {
  const slug =
    voucher.productSlug ||
    voucher.allowedProductSlug ||
    voucher.meta?.sourceItem?.slug;

  const locale = normalizeLocale(voucher.locale || voucher.orderLocale || voucher.sourceOrder?.orderLocale || 'sk');
  const labels = PDF_LABELS[locale] || PDF_LABELS.sk;

  const cfg = PDF_BY_PRODUCT_SLUG[slug];

  if (!cfg) {
    strapi.log.warn(`[GIFT_VOUCHER][PDF] Missing config for slug: ${slug}`);
    return null;
  }

  const templatePath = path.join(POUKAZY_DIR, cfg.file);

  let templateBytes: Buffer;

  try {
    templateBytes = await fs.readFile(templatePath);
  } catch (e) {
    strapi.log.error(`[GIFT_VOUCHER][PDF] Template not found: ${templatePath}`);
    throw e;
  }

  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  pdfDoc.registerFontkit(fontkit);

  const fontPath = path.join(process.cwd(), 'fonts', 'DejaVuSans-Bold.ttf');

  const fontBytes = await fs.readFile(fontPath);

  const font = await pdfDoc.embedFont(fontBytes);
  const boldFont = font;


  const validUntil = new Date();
  validUntil.setFullYear(validUntil.getFullYear() + 1);

  const validUntilText = validUntil.toLocaleDateString(getDateLocale(locale), {
    timeZone: 'Europe/Bratislava',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const labelFontSize = cfg.labelFontSize || 10;
  const valueFontSize = cfg.valueFontSize || 10;

  page.drawText(labels.code, {
    x: cfg.labelCode.x,
    y: cfg.labelCode.y,
    size: labelFontSize,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  page.drawText(voucher.code || '', {
    x: cfg.valueCode.x,
    y: cfg.valueCode.y,
    size: valueFontSize,
    font,
    color: rgb(0, 0, 0),
  });

  page.drawText(labels.validUntil, {
    x: cfg.labelValidUntil.x,
    y: cfg.labelValidUntil.y,
    size: labelFontSize,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  page.drawText(validUntilText, {
    x: cfg.valueValidUntil.x,
    y: cfg.valueValidUntil.y,
    size: labelFontSize,
    font,
    color: rgb(0, 0, 0),
  });

  const pdfBytes = await pdfDoc.save();

  return {
    filename: `darcekovy-poukaz-${voucher.code}.pdf`,
    content: Buffer.from(pdfBytes),
    contentType: 'application/pdf',
  };
}

async function getVoucherProductShort(voucher: any) {
  try {
    const slug =
      voucher.productSlug ||
      voucher.allowedProductSlug ||
      voucher.meta?.sourceItem?.slug;

    if (!slug) return '';

    const products = await strapi.entityService.findMany('api::product.product', {
      filters: {
        slug: {
          $eq: slug,
        },
      },
      fields: ['short'],
      limit: 1,
    } as any);

    const product = Array.isArray(products) ? products[0] : null;

    return product?.short || '';
  } catch (e) {
    strapi.log.warn(`[GIFT_VOUCHER][EMAIL] product short fetch failed: ${String(e)}`);
    return '';
  }
}

function escapeHtml(value?: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateSK(value?: string | null) {
  if (!value) return '';

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return '';

  return d.toLocaleDateString('sk-SK', {
    timeZone: 'Europe/Bratislava',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function buildVoucherEmailHtml(voucher: any) {
  const voucherTitle = voucher.title || voucher.productName || 'Darčeková poukážka';

  const valueHtml = voucher.amount
    ? `<p><b>Hodnota:</b> ${Number(voucher.amount).toFixed(2)} ${escapeHtml(voucher.currency || 'EUR')}</p>`
    : '';

  const validToFormatted = formatDateSK(voucher.validTo);

  const validToHtml = validToFormatted
    ? `<p><b>Platnosť do:</b> ${escapeHtml(validToFormatted)}</p>`
    : `<p><b>Platnosť:</b> 1 rok od dátumu zakúpenia.</p>`;

  const recipientHtml = voucher.recipientName
    ? `<p><b>Pre:</b> ${escapeHtml(voucher.recipientName)}</p>`
    : '';

  const messageHtml = voucher.message
    ? `<p><b>Venovanie:</b><br>${escapeHtml(voucher.message).replace(/\n/g, '<br>')}</p>`
    : '';

  const usageText =
    voucher.voucherType === 'value'
      ? 'Poukážku môžete použiť ako kredit v uvedenej hodnote. Ak je hodnota objednávky vyššia, rozdiel je potrebné doplatiť.'
      : 'Poukážku môžete uplatniť zadaním kódu v košíku alebo pri rezervácii podľa podmienok poukážky.';

  const productShortHtml = voucher.productShort
      ? `<div style="margin-top:16px; font-size:14px; line-height:1.6; color:#444;">
          ${String(voucher.productShort)
            .replace(/\\n/g, '<br>')
            .replace(/\n/g, '<br>')}
        </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <title>Darčeková poukážka ${escapeHtml(voucher.code)}</title>
  <style>
    body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; }
    .container {
      max-width: 600px; margin: 40px auto; border-radius: 0px; box-shadow: 0 0 10px rgba(0,0,0,0.05); overflow: hidden; background:#fff;
    }
    .header { background-color: #0e29a0; color: white; padding: 24px; text-align: center; }
    .header h1 { margin:0; font-size:26px; }
    .content { padding: 32px; background:#fff; }
    .content h2 { margin-top: 0; color: #333; }
    .content p { font-size: 16px; line-height: 1.6; color: #444; }
    .voucher-box {
      background:#f8f8f8; border:1px solid #ddd; padding:20px; margin:20px 0;
    }
    .voucher-code {
      display:inline-block; font-size:24px; font-weight:bold; letter-spacing:1px; color:#0e29a0; margin-top:6px;
    }
    .footer {
      background-color:#eee; padding:20px; text-align:center; font-size:13px; color:#666;
    }
    .footer a { color:#0e29a0; text-decoration:none; }
    .footer-logo { margin-top:16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Vitajte v Majolike</h1></div>

    <div class="content">
      <h2>Vaša darčeková poukážka</h2>

      <p>Dobrý deň,</p>
      <p>ďakujeme za objednávku. Vaša darčeková poukážka bola vytvorená.</p>

      <div class="voucher-box">
        <p><b>Názov:</b> ${escapeHtml(voucherTitle)}</p>
        <p><b>Kód poukážky:</b><br><span class="voucher-code">${escapeHtml(voucher.code)}</span></p>
        ${valueHtml}
        ${recipientHtml}
        ${messageHtml}
        ${validToHtml}
      </div>

      ${productShortHtml}

      <p>${escapeHtml(usageText)}</p>

      <p>S pozdravom,<br>Slovenská ľudová majolika</p>
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
        <a href="https://www.majolika.sk">
          <img src="https://www.majolika.sk/assets/img/logo-SLM-modre.gif" border="0" alt="SLM logo" width="200" />
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export default {
  async afterCreate(event: any) {
    try {
      const created = event.result as any;

      if (!created?.documentId) return;

      const locale = normalizeLocale(created.locale || created.orderLocale || 'sk');

      const voucher = await strapi.documents('api::gift-voucher.gift-voucher' as any).findOne({
        documentId: created.documentId,
        locale,
        populate: {
          sourceOrder: true,
          customer: true,
        },
      } as any) as any;

      if (!voucher) return;

      voucher.locale = locale;
      voucher.orderLocale = voucher.orderLocale || created.orderLocale || locale;

      const to = voucher.recipientEmail || voucher.customerEmail;

      if (!to) {
        strapi.log.warn(`[GIFT_VOUCHER][EMAIL] Missing email for voucher ${voucher.code}`);
        return;
      }

      const productShort = await getVoucherProductShort(voucher);
      voucher.productShort = productShort;

      const generatedPdf = await createFilledVoucherPdf(voucher);

      await sendEmail({
        to,
        subject: `Darčeková poukážka ${voucher.code}`,
        html: buildVoucherEmailHtml(voucher),
        attachments: generatedPdf ? [generatedPdf] : undefined,
      });

      strapi.log.info(`[GIFT_VOUCHER][EMAIL] Sent voucher ${voucher.code} to ${to}`);

      if (generatedPdf) {
        strapi.log.info(`[GIFT_VOUCHER][PDF] Attached generated PDF for voucher ${voucher.code}`);
      } else {
        strapi.log.warn(`[GIFT_VOUCHER][PDF] No PDF attached for voucher ${voucher.code}`);
      }
    } catch (e) {
      strapi.log.error('[GIFT_VOUCHER][afterCreate] error', e);
    }
  },
};