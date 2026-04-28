import fs from 'fs';
import { sendEmail } from '../../../../utils/email';
import { generateGiftVoucherPdfFile } from '../../../../utils/giftVoucherPdf';

async function uploadPdfToStrapi(file: {
  path: string;
  name: string;
  type: string;
  size: number;
}) {
  const uploaded = await strapi.plugin('upload').service('upload').upload({
    data: {
      fileInfo: {
        name: file.name,
        alternativeText: file.name,
        caption: file.name,
      },
    },
    files: file,
  });

  return uploaded?.[0] || null;
}

function getFrontendUrl() {
  return String(process.env.FRONTEND_URL || 'https://www.majolika.sk').replace(/\/$/, '');
}

function buildVoucherEmailHtml(voucher: any, pdfUrl?: string | null) {
  const linkHtml = pdfUrl
    ? `<p><a href="${pdfUrl}" style="display:inline-block;padding:12px 20px;background:#0e29a0;color:#fff;text-decoration:none;border-radius:4px;">Stiahnuť darčekovú poukážku</a></p>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#333;">
      <h2>Vaša darčeková poukážka</h2>
      <p>Dobrý deň,</p>
      <p>ďakujeme za objednávku. Vaša darčeková poukážka bola vytvorená.</p>

      <div style="padding:16px;border:1px solid #eee;border-radius:8px;background:#fafafa;">
        <p><b>Názov:</b> ${voucher.title || voucher.productName || '-'}</p>
        <p><b>Kód poukážky:</b> ${voucher.code}</p>
        ${voucher.amount ? `<p><b>Hodnota:</b> ${Number(voucher.amount).toFixed(2)} ${voucher.currency || 'EUR'}</p>` : ''}
      </div>

      ${linkHtml}

      <p>Kód môžete použiť v košíku alebo pri rezervácii podľa typu poukážky.</p>

      <p>S pozdravom,<br>Slovenská ľudová majolika</p>
    </div>
  `;
}

export default {
  async afterCreate(event: any) {
    try {
      const created = event.result as any;

      if (!created?.documentId) return;

      const voucher = await strapi.documents('api::gift-voucher.gift-voucher' as any).findOne({
        documentId: created.documentId,
        populate: {
          pdf: true,
          sourceOrder: true,
          customer: true,
        },
      } as any) as any;

      if (!voucher) return;

      if (voucher.pdf) {
        strapi.log.info(`[GIFT_VOUCHER][PDF] PDF already exists for ${voucher.code}`);
        return;
      }

      const pdfFile = await generateGiftVoucherPdfFile(voucher);
      const uploaded = await uploadPdfToStrapi(pdfFile);

      if (!uploaded?.id) {
        strapi.log.error(`[GIFT_VOUCHER][PDF] Upload failed for ${voucher.code}`);
        return;
      }

      await strapi.documents('api::gift-voucher.gift-voucher' as any).update({
        documentId: voucher.documentId,
        data: {
          pdf: uploaded.id,
        } as any,
      } as any);

      const freshVoucher = await strapi.documents('api::gift-voucher.gift-voucher' as any).findOne({
        documentId: voucher.documentId,
        populate: {
          pdf: true,
        },
      } as any) as any;

      const pdfUrlRaw = freshVoucher?.pdf?.url || null;
      const pdfUrl = pdfUrlRaw
        ? pdfUrlRaw.startsWith('http')
          ? pdfUrlRaw
          : `${getFrontendUrl()}${pdfUrlRaw}`
        : null;

      const to = voucher.recipientEmail || voucher.customerEmail;

      if (to) {
        await sendEmail({
          to,
          subject: `Darčeková poukážka ${voucher.code}`,
          html: buildVoucherEmailHtml(voucher, pdfUrl),
        });

        strapi.log.info(`[GIFT_VOUCHER][EMAIL] Sent voucher ${voucher.code} to ${to}`);
      } else {
        strapi.log.warn(`[GIFT_VOUCHER][EMAIL] Missing email for voucher ${voucher.code}`);
      }

      try {
        fs.unlinkSync(pdfFile.path);
      } catch {}

      strapi.log.info(`[GIFT_VOUCHER][PDF] Generated PDF for ${voucher.code}`);
    } catch (e) {
      strapi.log.error('[GIFT_VOUCHER][afterCreate] error', e);
    }
  },
};