import fs from 'fs';
import os from 'os';
import path from 'path';

const PDFDocument = require('pdfkit');

function getFontPath() {
  const candidates = [
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];

  return candidates.find((p) => fs.existsSync(p)) || null;
}

function safeText(value: any) {
  return String(value ?? '');
}

export async function generateGiftVoucherPdfFile(voucher: any) {
  const filename = `gift-voucher-${voucher.code}.pdf`;
  const filePath = path.join(os.tmpdir(), filename);
  const fontPath = getFontPath();

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      info: {
        Title: `Darčeková poukážka ${voucher.code}`,
        Author: 'Slovenská ľudová majolika',
      },
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    if (fontPath) {
      doc.registerFont('DejaVu', fontPath);
      doc.font('DejaVu');
    }

    const pageW = doc.page.width;
    const pageH = doc.page.height;

    doc.rect(0, 0, pageW, pageH).fill('#f5f5f5');

    // hlavicka
    doc.rect(0, 0, pageW, 110).fill('#0e29a0');
    doc.fillColor('#ffffff');
    doc.fontSize(24).text('Vitajte v Majolike', 60, 38, {
      width: pageW - 120,
      align: 'center',
    });

    // telo
    doc.roundedRect(46, 145, pageW - 92, 455, 0).fill('#ffffff');
    doc.strokeColor('#eaeaea').lineWidth(1).rect(46, 145, pageW - 92, 455).stroke();

    doc.fillColor('#333333');
    doc.fontSize(28).text('Darčeková poukážka', 70, 185, {
      width: pageW - 140,
      align: 'center',
    });

    doc.fillColor('#666666');
    doc.fontSize(14).text(safeText(voucher.title || voucher.productName || 'Darčeková poukážka'), 80, 235, {
      width: pageW - 160,
      align: 'center',
    });

    doc.roundedRect(95, 285, pageW - 190, 120, 0).fillAndStroke('#fcfcfc', '#eaeaea');

    doc.fillColor('#777777');
    doc.fontSize(12).text('KÓD POUKÁŽKY', 95, 310, {
      width: pageW - 190,
      align: 'center',
    });

    doc.fillColor('#0e29a0');
    doc.fontSize(26).text(safeText(voucher.code), 95, 340, {
      width: pageW - 190,
      align: 'center',
      characterSpacing: 1,
    });

    let y = 440;

    doc.fillColor('#333333');
    doc.fontSize(15);

    if (voucher.amount) {
      doc.text(`Hodnota: ${Number(voucher.amount).toFixed(2)} ${voucher.currency || 'EUR'}`, 90, y, {
        width: pageW - 180,
        align: 'center',
      });
      y += 30;
    }

    if (voucher.recipientName) {
      doc.text(`Pre: ${safeText(voucher.recipientName)}`, 90, y, {
        width: pageW - 180,
        align: 'center',
      });
      y += 30;
    }

    if (voucher.message) {
      doc.text(`Venovanie: ${safeText(voucher.message)}`, 90, y, {
        width: pageW - 180,
        align: 'center',
      });
      y += 45;
    }

    if (voucher.validTo) {
      const validTo = new Date(voucher.validTo).toLocaleDateString('sk-SK');
      doc.text(`Platnosť do: ${validTo}`, 90, y, {
        width: pageW - 180,
        align: 'center',
      });
      y += 30;
    }

    const usageText =
      voucher.voucherType === 'value'
        ? 'Poukážku je možné použiť ako kredit v uvedenej hodnote. Ak je hodnota objednávky vyššia, rozdiel je potrebné doplatiť.'
        : 'Poukážku je možné uplatniť zadaním kódu v košíku alebo pri rezervácii podľa podmienok poukážky.';

    doc.fillColor('#444444');
    doc.fontSize(11).text(usageText, 85, 535, {
      width: pageW - 170,
      align: 'center',
      lineGap: 4,
    });

    // pata
    doc.rect(0, pageH - 160, pageW, 160).fill('#fafafa');

    doc.fillColor('#777777');
    doc.fontSize(10).text(
      'Slovenská ľudová majolika\nDolná 138, 900 01 Modra\nIČO: 00 167 975 | DIČ: 2020360155\nIBAN: SK97 0900 0000 0051 3558 7112 (SLSP)\nmajolika@majolika.sk | info@majolika.sk\n+421 911 980 105\nOtváracie hodiny: Po–Pia 8:00–16:00 | So–Ne 10:00–16:00',
      70,
      pageH - 135,
      {
        width: pageW - 140,
        align: 'center',
        lineGap: 2,
      },
    );

    doc.fillColor('#0e29a0');
    doc.fontSize(11).text('www.majolika.sk', 70, pageH - 32, {
      width: pageW - 140,
      align: 'center',
    });

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