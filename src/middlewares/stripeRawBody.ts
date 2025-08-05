export default (config, { strapi }) => {
    return async (ctx, next) => {
      if (ctx.request.path === '/stripe/webhook' && ctx.request.method === 'POST') {
        let raw = '';
        await new Promise<void>((resolve) => {
          ctx.req.on('data', (chunk) => {
            raw += chunk;
          });
          ctx.req.on('end', () => {
            ctx.request.body = raw;
            resolve();
          });
        });
      }
      await next();
    };
  };