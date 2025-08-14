export default {
  async create(ctx) {
    const { body } = ctx.request;

    // Len logovanie + istota, že posielame payload tak, ako ho service očakáva
    strapi.log.info('CHECKOUT PAYLOAD (controller):');
    strapi.log.info(JSON.stringify(body, null, 2));

    // Očakávaný tvar v services/checkout.createSession:
    // { customer, items, temporaryId }
    const result = await strapi.service('api::checkout.checkout').createSession(body);
    return ctx.send(result);
  },
};