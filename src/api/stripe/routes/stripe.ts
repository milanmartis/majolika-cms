export default {
  routes: [
    {
      method: 'POST',
      path: '/stripe/webhook',       
      handler: 'stripe.webhook',
      config: {
        auth: false,
        policies: [],
        middlewares: [
          async (ctx, next) => {
            ctx.req.body = await new Promise(resolve => {
              let data = '';
              ctx.req.on('data', chunk => (data += chunk));
              ctx.req.on('end', () => resolve(Buffer.from(data)));
            });
            await next();
          },
        ],
      },
    },
  ],
};