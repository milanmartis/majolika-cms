// src/middlewares/stripe-raw.ts
import { raw } from 'koa-bodyparser';

export default (config, { strapi }) => {
  const stripeRaw = raw({ type: 'application/json' });
  return async (ctx, next) => {
    if (ctx.request.url === '/api/stripe/webhook') {
      await stripeRaw(ctx, next);
    } else {
      await next();
    }
  };
};