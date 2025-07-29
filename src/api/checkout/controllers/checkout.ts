import dotenv from 'dotenv';
dotenv.config({ path: require('path').resolve(__dirname, '../../../../.env') });

// alebo ak si v dist, môžeš to podmieniť buildom:
if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: require('path').resolve(__dirname, '../../../../dist/.env') });
}

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
  