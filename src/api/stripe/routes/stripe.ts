// src/api/stripe/routes/stripe.ts

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
          // RAW BODY iba na tomto route!
          async (ctx: any, next: any) => {
            ctx.req.body = await new Promise(resolve => {
              let data = '';
              ctx.req.on('data', chunk => (data += chunk));
              ctx.req.on('end', () => resolve(Buffer.from(data))); // Buffer!
            });
            await next();
          },
        ],
      },
    },
  ],
};
