'use strict';

import { applyKrosWebhook, processQueuedKrosOrders, sendOrderToKros, verifyKrosSignature } from '../../../utils/kros';

function safeJsonParse(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export default {
  async webhook(ctx: any) {
    const rawBody =
      typeof ctx.request.body === 'string'
        ? ctx.request.body
        : JSON.stringify(ctx.request.body || {});

    const signature = ctx.request.headers['x-kros-signature-256'];

    // DEBUG LOGGER
    strapi.log.info(`[KROS][WEBHOOK][RAW] ${rawBody}`);
    strapi.log.info(`[KROS][WEBHOOK][SIGNATURE] ${String(signature || '')}`);

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
        ? (safeJsonParse(ctx.request.body) || {})
        : (ctx.request.body || {});

    try {
      const result = await applyKrosWebhook(payload);
      ctx.status = 200;
      ctx.body = { ok: true, result };
    } catch (e: any) {
      strapi.log.error('[KROS][WEBHOOK] processing failed:', e?.message || e);
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Webhook processing failed' };
    }
  },

  async sendOrder(ctx: any) {
    try {
      const id = Number(ctx.params.id);
      if (!Number.isFinite(id)) return ctx.badRequest('Invalid order id');

      const result = await sendOrderToKros(id);
      ctx.body = result;
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
      strapi.log.error('[KROS][QUEUE] process failed:', e?.message || e);
      ctx.throw(500, e?.message || 'Queue processing failed');
    }
  },
};