// src/middlewares/stripe-raw.js
const { raw } = require('koa-bodyparser');
const stripeRaw = raw({ type: 'application/json' });

module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    // presná cesta, kam Stripe CLI posiela webhooky
    if (ctx.request.url === '/api/stripe/webhook') {
      await stripeRaw(ctx, next);
    } else {
      await next();
    }
  };
};
