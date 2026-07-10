'use strict';

import {
  applyKrosWebhook,
  fetchInvoiceFromKros,
  processQueuedKrosOrders,
  sendOrderToKros,
  verifyKrosSignature,
  verifyPublicInvoiceToken,
} from '../../../utils/kros';

function safeJsonParse(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function safeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export default {
  async webhook(ctx: any) {
    const rawBody =
      typeof ctx.request.body === 'string'
        ? ctx.request.body
        : JSON.stringify(ctx.request.body || {});

    const signature =
      ctx.request.headers['x-kros-signature-256'];

    strapi.log.info(
      `[KROS][WEBHOOK][RAW] ${rawBody}`
    );

    strapi.log.info(
      `[KROS][WEBHOOK][SIGNATURE] ${String(signature || '')}`
    );

    if (process.env.KROS_WEBHOOK_SECRET) {
      const valid = verifyKrosSignature(
        rawBody,
        signature as string
      );

      if (!valid) {
        strapi.log.warn(
          '[KROS][WEBHOOK] invalid signature'
        );

        ctx.status = 401;
        ctx.body = {
          ok: false,
          error: 'Invalid signature',
        };

        return;
      }
    }

    const payload =
      typeof ctx.request.body === 'string'
        ? safeJsonParse(ctx.request.body) || {}
        : ctx.request.body || {};

    try {
      const result = await applyKrosWebhook(payload);

      ctx.status = 200;
      ctx.body = {
        ok: true,
        result,
      };
    } catch (e: any) {
      strapi.log.error(
        '[KROS][WEBHOOK] processing failed:',
        e?.message || e
      );

      ctx.status = 500;
      ctx.body = {
        ok: false,
        error: 'Webhook processing failed',
      };
    }
  },

  async sendOrder(ctx: any) {
    try {
      const id = Number(ctx.params.id);

      if (!Number.isFinite(id)) {
        return ctx.badRequest('Invalid order id');
      }

      const result = await sendOrderToKros(id);

      ctx.body = result;
    } catch (e: any) {
      strapi.log.error(
        '[KROS][SEND] failed:',
        e?.message || e
      );

      ctx.throw(
        500,
        e?.message || 'KROS send failed'
      );
    }
  },

  async processQueue(ctx: any) {
    try {
      const result =
        await processQueuedKrosOrders(10);

      ctx.body = {
        ok: true,
        ...result,
      };
    } catch (e: any) {
      strapi.log.error(
        '[KROS][QUEUE] process failed:',
        e?.message || e
      );

      ctx.throw(
        500,
        e?.message || 'Queue processing failed'
      );
    }
  },

  async publicInvoice(ctx: any) {
    const token = String(
      ctx.params.token || ''
    );

    const verified =
      verifyPublicInvoiceToken(token);

    if (!verified) {
      ctx.status = 403;
      ctx.body =
        'Odkaz na faktúru je neplatný alebo vypršal.';

      return;
    }

    const order = await strapi.db
      .query('api::order.order')
      .findOne({
        where: {
          id: verified.orderId,
        },
        select: [
          'id',
          'krosDocumentId',
          'krosInvoiceNumber',
        ],
      });

    if (!order) {
      ctx.status = 404;
      ctx.body =
        'Objednávka nebola nájdená.';

      return;
    }

    const storedDocumentId = String(
      order.krosDocumentId || ''
    );

    if (
      !storedDocumentId ||
      storedDocumentId !==
        String(verified.documentId)
    ) {
      ctx.status = 404;
      ctx.body =
        'Faktúra nebola nájdená.';

      return;
    }

    try {
      strapi.log.info(
        `[KROS][PUBLIC INVOICE] requesting ` +
        `orderId=${order.id} ` +
        `documentId=${storedDocumentId}`
      );

      const response =
        await fetchInvoiceFromKros(
          storedDocumentId
        );

      const contentType =
        response.headers.get('content-type') ||
        'application/octet-stream';

      const body = Buffer.from(
        await response.arrayBuffer()
      );

      if (!response.ok) {
        const errorText =
          body.toString('utf8');

        strapi.log.error(
          `[KROS][PUBLIC INVOICE] download failed ` +
          `orderId=${order.id} ` +
          `documentId=${storedDocumentId} ` +
          `status=${response.status} ` +
          `contentType=${contentType} ` +
          `response=${errorText}`
        );

        ctx.status = 502;

        // Dočasne počas testovania:
        ctx.body = {
          error:
            'Faktúru sa nepodarilo načítať.',
          krosStatus: response.status,
          krosContentType: contentType,
          krosResponse: errorText,
          orderId: order.id,
          documentId: storedDocumentId,
        };

        return;
      }

      const upstreamDisposition =
        response.headers.get(
          'content-disposition'
        );

      const invoiceNumber =
        safeFilename(
          String(
            order.krosInvoiceNumber ||
              order.id
          )
        );

      ctx.set(
        'Content-Type',
        contentType
      );

      ctx.set(
        'Cache-Control',
        'private, no-store, max-age=0'
      );

      ctx.set(
        'X-Content-Type-Options',
        'nosniff'
      );

      if (upstreamDisposition) {
        ctx.set(
          'Content-Disposition',
          upstreamDisposition
        );
      } else if (
        contentType.includes(
          'application/pdf'
        )
      ) {
        ctx.set(
          'Content-Disposition',
          `inline; filename="faktura-${invoiceNumber}.pdf"`
        );
      } else if (
        contentType.includes(
          'application/json'
        )
      ) {
        ctx.set(
          'Content-Disposition',
          `inline; filename="faktura-${invoiceNumber}.json"`
        );
      } else {
        ctx.set(
          'Content-Disposition',
          `inline; filename="faktura-${invoiceNumber}"`
        );
      }

      ctx.status = 200;
      ctx.body = body;
    } catch (e: any) {
      strapi.log.error(
        `[KROS][PUBLIC INVOICE] failed ` +
        `orderId=${order.id} ` +
        `documentId=${storedDocumentId}: ` +
        `${e?.message || e}`
      );

      ctx.status = 502;

      // Dočasne počas testovania:
      ctx.body = {
        error:
          'Faktúru sa nepodarilo načítať.',
        detail:
          e?.message || String(e),
        orderId: order.id,
        documentId: storedDocumentId,
      };
    }
  },
};