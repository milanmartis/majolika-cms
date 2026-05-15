import { sendEmail } from '../../../../utils/email';

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
    ? `<div style="margin-top:16px;">${voucher.productShort}</div>`
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
      margin-top: 20px; padding: 18px; border: 1px solid #eaeaea; border-radius: 0px; background: #fcfcfc;
    }
    .voucher-code {
      font-size: 22px; font-weight: bold; letter-spacing: 1px; color: #0e29a0;
    }
    .footer { background-color: #fafafa; color: #777; font-size: 13px; padding: 24px; text-align: center; line-height: 1.5; }
    .footer a { color: #0e29a0; text-decoration: none; }
    .footer-logo { margin-top: 16px; }
    .footer-logo img { max-width: 200px; opacity: 0.9; }
    @media (max-width: 620px) { .content { padding: 20px; } .header { padding: 18px; } }
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

      const voucher = await strapi.documents('api::gift-voucher.gift-voucher' as any).findOne({
        documentId: created.documentId,
        populate: {
          sourceOrder: true,
          customer: true,
        },
      } as any) as any;

      if (!voucher) return;

      const to = voucher.recipientEmail || voucher.customerEmail;

      if (!to) {
        strapi.log.warn(`[GIFT_VOUCHER][EMAIL] Missing email for voucher ${voucher.code}`);
        return;
      }

      const productShort = await getVoucherProductShort(voucher);
      voucher.productShort = productShort;

      await sendEmail({
        to,
        subject: `Darčeková poukážka ${voucher.code}`,
        html: buildVoucherEmailHtml(voucher),
      });

      strapi.log.info(`[GIFT_VOUCHER][EMAIL] Sent voucher ${voucher.code} to ${to}`);
      strapi.log.info(`[GIFT_VOUCHER][PDF] Skipped PDF generation for ${voucher.code}`);
    } catch (e) {
      strapi.log.error('[GIFT_VOUCHER][afterCreate] error', e);
    }
  },
};
