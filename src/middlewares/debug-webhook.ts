import type { Context, Next } from 'koa';

export default (config, { strapi }) => {
  return async (ctx: Context, next: Next) => {
    // ak voláme stripe webhook, preskoč debug
    if (ctx.request.url === '/api/stripe/webhook') {
      return await next();
    }

    // inak beží debug logging
    strapi.log.debug('--- DEBUG WEBHOOK ---', {
      url: ctx.request.url,
      headers: ctx.request.headers,
      body: ctx.request.body,
    });

    await next();
  };
};