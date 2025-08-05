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
          // RAW body pre Stripe signature
          async (ctx: any, next: any) => {
            ctx.req.body = await new Promise(resolve => {
              let data = '';
              ctx.req.on('data', chunk => (data += chunk));
              ctx.req.on('end', () => resolve(data));
            });
            await next();
          },
        ],
      },
    },
  ],
};
