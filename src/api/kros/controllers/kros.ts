'use strict';

import { applyKrosWebhook, sendOrderToKros, verifyKrosSignature } from '../../../utils/kros';

export default {
  async webhook(ctx: any) {
    try {
      const signature = ctx.request.headers['x-kros-signature-256'];
      const rawBody =
        typeof ctx.request.body === 'string'
          ? ctx.request.body
          : JSON.stringify(ctx.request.body || {});

      const secretEnabled = !!process.env.KROS_WEBHOOK_SECRET;
      if (secretEnabled) {
        const ok = verifyKrosSignature(rawBody, signature as string);
        if (!ok) {
          strapi.log.warn('[KROS][WEBHOOK] Invalid signature');
          ctx.status = 401;
          ctx.body = { ok: false, error: 'Invalid signature' };
          return;
        }
      }

      const payload =
        typeof ctx.request.body === 'string'
          ? JSON.parse(ctx.request.body || '{}')
          : (ctx.request.body || {});

      const result = await applyKrosWebhook(payload);

      ctx.status = 200;
      ctx.body = { ok: true, result };
    } catch (e: any) {
      strapi.log.error('[KROS][WEBHOOK] failed:', e?.message || e);
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
      strapi.log.error('[KROS][SEND ORDER] failed:', e?.message || e);
      ctx.throw(500, e?.message || 'KROS send failed');
    }
  },
};