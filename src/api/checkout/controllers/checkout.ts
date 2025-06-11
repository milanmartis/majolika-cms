export default {
    async create(ctx) {
      const { items, customer } = ctx.request.body;
      const { url, order } = await strapi
        .service('api::checkout.checkout')
        .createSession({ items, customer });
  
      ctx.body = { checkoutUrl: url, order };
    },
  };
  