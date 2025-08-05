// src/middlewares/stripe-raw.ts
import getRawBody from 'raw-body';
import type { Context, Next } from 'koa';

export default (config, { strapi }) => {
  return async (ctx: Context, next: Next) => {
    if (ctx.request.url === '/api/stripe/webhook') {
      try {
        // parsovanie Bufferu
        const raw = await getRawBody(ctx.req as NodeJS.ReadableStream, {
          length: ctx.request.headers['content-length'] ?? undefined,
          limit: '1mb',
          encoding: null,            // NULL = Buffer
        });
        // prepíšeme telo
        ctx.request.body = raw;
      } catch (err) {
        strapi.log.error('Cannot read raw body', err);
        ctx.throw(400, 'Cannot read webhook body');
      }
    }
    await next();
  };
};