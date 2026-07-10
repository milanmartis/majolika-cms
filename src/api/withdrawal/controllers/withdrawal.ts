'use strict';

import { sendEmail } from '../../../utils/email';

interface TurnstileVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

function escapeHtml(value: string = ''): string {
  return String(value)
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
  return String(orderNumber)
    .trim()
    .replace(/^#/, '');
}

/**
 * Kontrola objednávky podľa čísla objednávky a e-mailu.
 *
 * Používa sa pri finálnom odoslaní formulára.
 */
async function findOrderByNumberAndEmail(
  orderNumberRaw: string,
  emailRaw: string
) {
  const orderNumber = normalizeOrderNumber(orderNumberRaw);
  const email = normalizeEmail(emailRaw);

  return await strapi.db.query('api::order.order').findOne({
    where: {
      invoiceNumber: orderNumber,
      customerEmail: email
    }
  });
}

/**
 * Kontrola objednávky iba podľa čísla objednávky.
 *
 * Používa sa na priebežnú kontrolu vo formulári.
 */
async function findOrderByNumber(orderNumberRaw: string) {
  const orderNumber = normalizeOrderNumber(orderNumberRaw);

  return await strapi.db.query('api::order.order').findOne({
    where: {
      invoiceNumber: orderNumber
    },
    select: ['id']
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
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.05);
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

        <a href="mailto:majolika@majolika.sk">
          majolika@majolika.sk
        </a>
        |
        <a href="mailto:info@majolika.sk">
          info@majolika.sk
        </a>
        <br>

        <a href="tel:+421911980105">
          +421 911 980 105
        </a>
        <br><br>

        Otváracie hodiny:
        Po–Pia 8:00–16:00 |
        So–Ne 10:00–16:00
      </p>

      <div class="footer-logo">
        <a href="https://www.majolika.sk">
          <img
            src="https://www.majolika.sk/assets/img/logo-SLM-modre.gif"
            border="0"
            alt="SLM logo"
            width="200"
          />
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export default {
  /**
   * Priebežná kontrola čísla objednávky.
   *
   * POST /api/withdrawal/check-order
   *
   * Body:
   * {
   *   "orderNumber": "12345"
   * }
   */
  async checkOrder(ctx) {
    try {
      const orderNumber = normalizeOrderNumber(
        ctx.request.body?.orderNumber
      );

      if (!orderNumber) {
        ctx.status = 400;
        ctx.body = {
          exists: false,
          code: 'ORDER_NUMBER_REQUIRED',
          message: 'Order number is required'
        };
        return;
      }

      const order = await findOrderByNumber(orderNumber);

      ctx.status = 200;
      ctx.body = {
        exists: Boolean(order)
      };
    } catch (err) {
      strapi.log.error(
        '[WITHDRAWAL] checkOrder failed',
        err
      );

      ctx.status = 500;
      ctx.body = {
        exists: false,
        code: 'ORDER_CHECK_FAILED',
        message: 'Order check failed'
      };
    }
  },

  /**
   * Finálne odoslanie odstúpenia od zmluvy.
   *
   * POST /api/withdrawal
   */
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
      } = ctx.request.body || {};

      if (
        !name ||
        !orderNumber ||
        !products ||
        !email ||
        !gdpr ||
        !turnstileToken
      ) {
        return ctx.badRequest('Missing required fields');
      }

      const verifyResponse = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            secret:
              process.env.TURNSTILE_SECRET_KEY || '',
            response: turnstileToken
          })
        }
      );

      const verifyResult =
        (await verifyResponse.json()) as TurnstileVerifyResponse;

      if (!verifyResult.success) {
        ctx.status = 400;
        ctx.body = {
          ok: false,
          code: 'CAPTCHA_FAILED',
          message: 'Captcha verification failed'
        };
        return;
      }

      /*
       * Pri finálnom odoslaní sa kontroluje kombinácia:
       *
       * číslo objednávky + e-mail zákazníka.
       */
      const order = await findOrderByNumberAndEmail(
        orderNumber,
        email
      );

      if (!order) {
        ctx.status = 404;
        ctx.body = {
          ok: false,
          code: 'ORDER_NOT_FOUND',
          message:
            'Order with this number and email was not found'
        };
        return;
      }

      const safeName = escapeHtml(name);

      const safeOrderNumber = escapeHtml(
        normalizeOrderNumber(orderNumber)
      );

      const safeProducts = escapeHtml(products)
        .replace(/\n/g, '<br>');

      const safeEmail = escapeHtml(
        normalizeEmail(email)
      );

      const safePhone = escapeHtml(phone || '-');

      const orderId = escapeHtml(
        String((order as any).id || '-')
      );

      const invoiceNumber = escapeHtml(
        String((order as any).invoiceNumber || '-')
      );

      const subjectCustomer =
        'Potvrdenie prijatia oznámenia o odstúpení od zmluvy';

      const subjectAdmin =
        'Nové oznámenie o odstúpení od zmluvy';

      const htmlCustomer = renderWithdrawalEmail({
        title: subjectCustomer,
        heading: 'Potvrdenie prijatia oznámenia',
        bodyHtml: `
          <p>Dobrý deň,</p>

          <p>
            Potvrdzujeme prijatie oznámenia
            o odstúpení od zmluvy.
          </p>

          <p>
            O ďalšom postupe Vás budeme informovať.
          </p>

          <div class="box">
            <p>
              <strong>Meno:</strong>
              ${safeName}
            </p>

            <p>
              <strong>Číslo objednávky:</strong>
              ${safeOrderNumber}
            </p>

            <p>
              <strong>Produkt/y:</strong><br>
              ${safeProducts}
            </p>

            <p>
              <strong>E-mail:</strong>
              ${safeEmail}
            </p>

            <p>
              <strong>Telefón:</strong>
              ${safePhone}
            </p>
          </div>

          <p>
            S pozdravom<br>
            Majolika
          </p>
        `
      });

      const htmlAdmin = renderWithdrawalEmail({
        title: subjectAdmin,
        heading:
          'Nové oznámenie o odstúpení od zmluvy',
        bodyHtml: `
          <p>
            Bolo prijaté nové oznámenie
            o odstúpení od zmluvy.
          </p>

          <div class="box">
            <p>
              <strong>Meno:</strong>
              ${safeName}
            </p>

            <p>
              <strong>Číslo zadané zákazníkom:</strong>
              ${safeOrderNumber}
            </p>

            <p>
              <strong>ID objednávky v Strapi:</strong>
              ${orderId}
            </p>

            <p>
              <strong>Číslo faktúry / invoiceNumber:</strong>
              ${invoiceNumber}
            </p>

            <p>
              <strong>Produkt/y:</strong><br>
              ${safeProducts}
            </p>

            <p>
              <strong>E-mail:</strong>
              ${safeEmail}
            </p>

            <p>
              <strong>Telefón:</strong>
              ${safePhone}
            </p>

            <p>
              <strong>GDPR súhlas:</strong>
              áno
            </p>
          </div>
        `
      });

      await sendEmail({
        to: normalizeEmail(email),
        subject: subjectCustomer,
        html: htmlCustomer
      });

      await sendEmail({
        to: 'majolika@majolika.sk, katarina.borisova@majolika.sk, milanmartis@gmail.com',
        subject: subjectAdmin,
        html: htmlAdmin
      });

      ctx.status = 200;
      ctx.body = {
        ok: true,
        code: 'WITHDRAWAL_ACCEPTED',
        message: 'Withdrawal request accepted'
      };
    } catch (err) {
      strapi.log.error(
        '[WITHDRAWAL] submit failed',
        err
      );

      return ctx.internalServerError(
        'Withdrawal request failed'
      );
    }
  }
};