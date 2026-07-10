'use strict';

import {
  applyKrosWebhook,
  fetchInvoicePdfForOrder,
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

    const signature = ctx.request.headers['x-kros-signature-256'];

    strapi.log.info(`[KROS][WEBHOOK][RAW] ${rawBody}`);

    if (process.env.KROS_WEBHOOK_SECRET) {
      const valid = verifyKrosSignature(rawBody, signature as string);

      if (!valid) {
        strapi.log.warn('[KROS][WEBHOOK] invalid signature');
        ctx.status = 401;
        ctx.body = { ok: false, error: 'Invalid signature' };
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
      ctx.body = { ok: true, result };
    } catch (e: any) {
      strapi.log.error(
        '[KROS][WEBHOOK] processing failed:',
        e?.message || e
      );
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Webhook processing failed' };
    }
  },

  async sendOrder(ctx: any) {
    try {
      const id = Number(ctx.params.id);

      if (!Number.isFinite(id)) {
        return ctx.badRequest('Invalid order id');
      }

      ctx.body = await sendOrderToKros(id);
    } catch (e: any) {
      strapi.log.error('[KROS][SEND] failed:', e?.message || e);
      ctx.throw(500, e?.message || 'KROS send failed');
    }
  },

  async processQueue(ctx: any) {
    try {
      const result = await processQueuedKrosOrders(10);
      ctx.body = { ok: true, ...result };
    } catch (e: any) {
      strapi.log.error('[KROS][QUEUE] failed:', e?.message || e);
      ctx.throw(500, e?.message || 'Queue processing failed');
    }
  },

  async publicInvoice(ctx: any) {
    const token = String(ctx.params.token || '');
    const verified = verifyPublicInvoiceToken(token);

    if (!verified) {
      ctx.status = 403;
      ctx.body = 'Odkaz na faktúru je neplatný alebo vypršal.';
      return;
    }

    const order = await strapi.db.query('api::order.order').findOne({
      where: { id: verified.orderId },
      select: ['id', 'krosDocumentId', 'krosInvoiceNumber'],
    });

    if (!order) {
      ctx.status = 404;
      ctx.body = 'Objednávka nebola nájdená.';
      return;
    }

    try {
      const { response, invoice } = await fetchInvoicePdfForOrder(
        order.id,
        order.krosDocumentId ? String(order.krosDocumentId) : null
      );

      const body = Buffer.from(await response.arrayBuffer());
      const contentType =
        response.headers.get('content-type') || 'application/octet-stream';

      if (!response.ok) {
        strapi.log.error(
          `[KROS][PUBLIC INVOICE] PDF failed ` +
            `orderId=${order.id} documentId=${invoice.id} ` +
            `status=${response.status} response=${body.toString('utf8')}`
        );

        ctx.status = 502;
        ctx.body = 'Faktúru sa nepodarilo načítať.';
        return;
      }

      if (!contentType.toLowerCase().includes('application/pdf')) {
        strapi.log.error(
          `[KROS][PUBLIC INVOICE] expected PDF, got ${contentType}`
        );

        ctx.status = 502;
        ctx.body = 'KROS nevrátil PDF dokument.';
        return;
      }

      const resolvedDocumentId = String(invoice.id);

      if (String(order.krosDocumentId || '') !== resolvedDocumentId) {
        await strapi.entityService.update('api::order.order', order.id, {
          data: {
            krosDocumentId: resolvedDocumentId,
          } as any,
        });

        strapi.log.info(
          `[KROS][PUBLIC INVOICE] corrected document ID ` +
            `orderId=${order.id} new=${resolvedDocumentId}`
        );
      }

      const invoiceNumber = safeFilename(
        String(order.krosInvoiceNumber || order.id)
      );

      ctx.set('Content-Type', 'application/pdf');
      ctx.set(
        'Content-Disposition',
        `inline; filename="faktura-${invoiceNumber}.pdf"`
      );
      ctx.set('Cache-Control', 'private, no-store, max-age=0');
      ctx.set('X-Content-Type-Options', 'nosniff');
      ctx.status = 200;
      ctx.body = body;
    } catch (e: any) {
      strapi.log.error(
        `[KROS][PUBLIC INVOICE] failed orderId=${order.id}: ` +
          `${e?.message || e}`
      );

      ctx.status = 502;
      ctx.body = 'Faktúru sa nepodarilo načítať.';
    }
  },
};