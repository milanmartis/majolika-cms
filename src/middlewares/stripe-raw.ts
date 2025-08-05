// src/middlewares/stripe-raw.ts
import getRawBody from 'raw-body';
import type { Context, Next } from 'koa';

export default (config, { strapi }) => {
  return async (ctx: Context, next: Next) => {
    if (ctx.request.url === '/api/stripe/webhook') {
      strapi.log.info('🔷 stripe-raw middleware hit');
      try {
        const raw = await getRawBody(ctx.req as NodeJS.ReadableStream, {
          length: ctx.request.headers['content-length'],
          limit: '1mb',
          encoding: null,
        });
        ctx.request.body = raw;
        strapi.log.info('🔷 got raw body, length = ' + raw.length);
      } catch (err) {
        strapi.log.error('🔶 stripe-raw failed to read body', err);
        ctx.throw(400, 'Cannot read webhook body');
      }
    }
    await next();
  };
};