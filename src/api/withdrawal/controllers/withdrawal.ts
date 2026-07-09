'use strict';

import { sendEmail } from '../../../utils/email';

interface TurnstileVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

function escapeHtml(s: string = ''): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeEmail(email: string = ''): string {
  return String(email).trim().toLowerCase();
}

function normalizeOrderNumber(orderNumber: string = ''): string {
  return String(orderNumber).trim();
}

async function findOrderByNumberAndEmail(orderNumberRaw: string, emailRaw: string) {
    const orderNumber = normalizeOrderNumber(orderNumberRaw);
    const email = normalizeEmail(emailRaw);
  
    return await strapi.db.query('api::order.order').findOne({
      where: {
        $and: [
          { invoiceNumber: orderNumber },
          { customerEmail: email }
        ]
      }
    });
  }

function renderWithdrawalEmail(opts: {
  title: string;
  heading: string;
  bodyHtml: string;
}) {
  return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(opts.title)}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }

    .container {
      max-width: 600px;
      margin: 40px auto;
      border-radius: 0;
      box-shadow: 0 0 10px rgba(0,0,0,0.05);
      overflow: hidden;
      background: #ffffff;
    }

    .header {
      background-color: #0e29a0;
      color: white;
      padding: 24px;
      text-align: center;
    }

    .header h1 {
      margin: 0;
      font-size: 24px;
    }

    .content {
      padding: 32px;
    }

    .content h2 {
      margin-top: 0;
      color: #333333;
    }

    .content p {
      font-size: 16px;
      line-height: 1.6;
      color: #444444;
    }

    .box {
      margin: 16px 0;
      padding: 12px;
      border: 1px solid #eaeaea;
      border-radius: 0;
      background: #fcfcfc;
    }

    .box p {
      margin: 6px 0;
      font-size: 15px;
    }

    .footer {
      background-color: #fafafa;
      color: #777777;
      font-size: 13px;
      padding: 24px;
      text-align: center;
      line-height: 1.5;
    }

    .footer a {
      color: #0e29a0;
      text-decoration: none;
    }

    .footer-logo {
      margin-top: 16px;
    }

    .footer-logo img {
      max-width: 120px;
      opacity: 0.9;
    }

    @media (max-width: 620px) {
      .container {
        margin: 0;
      }

      .content {
        padding: 20px;
      }

      .header {
        padding: 18px;
      }
    }
  </style>
</head>

<body>
  <div class="container">
    <div class="header">
      <h1>Vitajte v Majolike</h1>
    </div>

    <div class="content">
      <h2>${escapeHtml(opts.heading)}</h2>
      ${opts.bodyHtml}
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
  async submit(ctx) {
    try {
      const {
        name,
        orderNumber,
        products,
        email,
        phone,
        gdpr,
        turnstileToken
      } = ctx.request.body;

      if (!name || !orderNumber || !products || !email || !gdpr || !turnstileToken) {
        return ctx.badRequest('Missing required fields');
      }

      const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY || '',
          response: turnstileToken
        })
      });

      const verifyResult = (await verifyResponse.json()) as TurnstileVerifyResponse;

      if (!verifyResult.success) {
        return ctx.badRequest('Captcha verification failed');
      }

      const order = await findOrderByNumberAndEmail(orderNumber, email);

      if (!order) {
        ctx.status = 404;
        ctx.body = {
          ok: false,
          code: 'ORDER_NOT_FOUND',
          message: 'Order with this email was not found'
        };
        return;
      }else{
        ctx.body = {
            ok: true,
            code: 'WITHDRAWAL_ACCEPTED',
            message: 'Withdrawal request accepted'
          };
      }

      const safeName = escapeHtml(name);
      const safeOrderNumber = escapeHtml(orderNumber);
      const safeProducts = escapeHtml(products).replace(/\n/g, '<br>');
      const safeEmail = escapeHtml(email);
      const safePhone = escapeHtml(phone || '-');

      const orderId = escapeHtml(String((order as any).id || '-'));
      const invoiceNumber = escapeHtml(String((order as any).invoiceNumber || '-'));

      const subjectCustomer = 'Potvrdenie prijatia oznámenia o odstúpení od zmluvy';
      const subjectAdmin = 'Nové oznámenie o odstúpení od zmluvy';

      const htmlCustomer = renderWithdrawalEmail({
        title: subjectCustomer,
        heading: 'Potvrdenie prijatia oznámenia',
        bodyHtml: `
          <p>Dobrý deň,</p>

          <p>potvrdzujeme prijatie oznámenia o odstúpení od zmluvy.</p>

          <p>O ďalšom postupe Vás budeme informovať.</p>

          <div class="box">
            <p><strong>Meno:</strong> ${safeName}</p>
            <p><strong>Číslo objednávky:</strong> ${safeOrderNumber}</p>
            <p><strong>Produkt/y:</strong><br>${safeProducts}</p>
            <p><strong>Email:</strong> ${safeEmail}</p>
            <p><strong>Telefón:</strong> ${safePhone}</p>
          </div>

          <p>S pozdravom<br>Majolika</p>
        `
      });

      const htmlAdmin = renderWithdrawalEmail({
        title: subjectAdmin,
        heading: 'Nové oznámenie o odstúpení od zmluvy',
        bodyHtml: `
          <p>Bolo prijaté nové oznámenie o odstúpení od zmluvy.</p>

          <div class="box">
            <p><strong>Meno:</strong> ${safeName}</p>
            <p><strong>Číslo zadané zákazníkom:</strong> ${safeOrderNumber}</p>
            <p><strong>ID objednávky v Strapi:</strong> ${orderId}</p>
            <p><strong>Číslo faktúry / invoiceNumber:</strong> ${invoiceNumber}</p>
            <p><strong>Produkt/y:</strong><br>${safeProducts}</p>
            <p><strong>Email:</strong> ${safeEmail}</p>
            <p><strong>Telefón:</strong> ${safePhone}</p>
            <p><strong>GDPR súhlas:</strong> áno</p>
          </div>
        `
      });

      await sendEmail({
        to: email,
        subject: subjectCustomer,
        html: htmlCustomer
      });

      await sendEmail({
        to: 'milanmartis@gmail.com',
        subject: subjectAdmin,
        html: htmlAdmin
      });

      ctx.body = {
        ok: true
      };
    } catch (err) {
      strapi.log.error('[WITHDRAWAL] submit failed', err);
      return ctx.internalServerError('Withdrawal request failed');
    }
  }
};