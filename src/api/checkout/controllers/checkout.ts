// src/api/checkout/controllers/checkout.ts
export default {
  async create(ctx) {
    try {
      const { body } = ctx.request;
      strapi.log.info('CHECKOUT PAYLOAD (controller):');
      strapi.log.info(JSON.stringify(body, null, 2));

      const result = await strapi.service('api::checkout.checkout').createSession(body);
      return ctx.send({ ok: true, ...result });
    } catch (err: any) {
      strapi.log.error('[CHECKOUT][CREATE] error:', err?.message || err);
      if (err?.details) strapi.log.error('[CHECKOUT][CREATE] details=' + JSON.stringify(err.details));
      if (err?.stack) strapi.log.error(err.stack);
      return ctx.badRequest(err?.message || 'Checkout failed');
    }
  },
};
