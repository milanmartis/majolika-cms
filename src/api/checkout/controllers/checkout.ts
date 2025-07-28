export default {
  async create(ctx) {
    console.log('CHECKOUT PAYLOAD:', ctx.request.body); // <- LOGNI SI DÁTA
    try {
      const session = await strapi
        .service('api::checkout.checkout')
        .createSession(ctx.request.body);

      return { checkoutUrl: session.url };
    } catch (err) {
      console.error('Checkout error:', err);
      ctx.throw(400, 'Bad Request');
    }
  },
  };
  