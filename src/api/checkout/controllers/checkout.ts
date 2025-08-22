export default {
  async create(ctx) {
    try {
      const { body } = ctx.request;

      // Log pre debug
      strapi.log.info('CHECKOUT PAYLOAD (controller):');
      strapi.log.info(JSON.stringify(body, null, 2));

      // Preposli do service
      const result = await strapi.service('api::checkout.checkout').createSession(body);
      return ctx.send(result);
    } catch (err: any) {
      strapi.log.error('[CHECKOUT][CREATE] error:', err?.message || err);
      return ctx.badRequest(err?.message || 'Checkout failed');
    }
  },
};