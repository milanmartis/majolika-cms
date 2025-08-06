export default {
  async create(ctx) {
    const { body } = ctx.request;
    const { items, customer, temporaryId } = ctx.request.body; // ← temporaryId TU
    strapi.log.info('CHECKOUT PAYLOAD:');
    strapi.log.info(JSON.stringify(ctx.request.body, null, 2));
    const result = await strapi.service('api::checkout.checkout').createSession(body);
    ctx.send(result);
  },
};