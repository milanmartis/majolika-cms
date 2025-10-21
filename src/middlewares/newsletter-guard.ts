import LRU from 'lru-cache';

const hits = new LRU<string, number>({ max: 5000, ttl: 60_000 }); // 1 min

export default (_config, { strapi }) => {
  return async (ctx, next) => {
    if (ctx.method === 'POST' && ctx.path === '/api/newsletter/subscribe') {
      const ip = ctx.ip || ctx.request.ip || 'unknown';
      const n = (hits.get(ip) || 0) + 1;
      hits.set(ip, n);
      if (n > 20) return ctx.tooManyRequests('rate_limited');

      const len = Number(ctx.request.length || 0);
      if (len > 8 * 1024) return ctx.badRequest('payload_too_big');
    }
    await next();
  };
};
