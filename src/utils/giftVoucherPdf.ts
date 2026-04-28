import fs from 'fs';
import os from 'os';
import path from 'path';
import PDFDocument from 'pdfkit';

export async function generateGiftVoucherPdfFile(voucher: any) {
  const filename = `gift-voucher-${voucher.code}.pdf`;
  const filePath = path.join(os.tmpdir(), filename);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    doc.fontSize(22).text('Slovenská ľudová majolika', { align: 'center' });
    doc.moveDown();

    doc.fontSize(18).text('Darčeková poukážka', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(14).text(`Názov: ${voucher.title || voucher.productName || '-'}`);
    doc.moveDown();

    doc.fontSize(16).text(`Kód poukážky: ${voucher.code}`, {
      align: 'center'
    });

    doc.moveDown();

    if (voucher.amount) {
      doc.fontSize(14).text(`Hodnota: ${Number(voucher.amount).toFixed(2)} ${voucher.currency || 'EUR'}`);
      doc.moveDown();
    }

    if (voucher.recipientName) {
      doc.text(`Pre: ${voucher.recipientName}`);
      doc.moveDown();
    }

    if (voucher.message) {
      doc.text(`Venovanie: ${voucher.message}`);
      doc.moveDown();
    }

    if (voucher.validTo) {
      const validTo = new Date(voucher.validTo).toLocaleDateString('sk-SK');
      doc.text(`Platnosť do: ${validTo}`);
      doc.moveDown();
    }

    doc.moveDown(2);
    doc.fontSize(11).text(
      'Poukážku je možné uplatniť zadaním kódu v košíku alebo pri rezervácii podľa podmienok poukážky.',
      { align: 'center' }
    );

    doc.moveDown(2);
    doc.fontSize(10).text('www.majolika.sk', { align: 'center' });

    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const stat = fs.statSync(filePath);

  return {
    path: filePath,
    name: filename,
    type: 'application/pdf',
    size: stat.size,
  };
}