// src/middlewares/debug-webhook.ts (alebo .js)
module.exports = (config, { strapi }) => {
    return async (ctx, next) => {
      if (ctx.request.url.includes('stripe/webhook')) {
        console.log('--- ALL HEADERS ---');
        console.log(ctx.request.headers);
        console.log('--- RAW BODY ---');
        console.log(ctx.request.body);
        console.log('--- IS BUFFER ---');
        console.log(Buffer.isBuffer(ctx.request.body));
      }
      await next();
    };
  };