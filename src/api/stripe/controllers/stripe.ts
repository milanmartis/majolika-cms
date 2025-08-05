import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx: any) {
    strapi.log.info('WEBHOOK HIT', { headers: ctx.request.headers });
    const sig = ctx.request.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        ctx.req.body, // Buffer!
        sig!,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      ctx.status = 400;
      ctx.body = `Webhook Error: ${err.message}`;
      return;
    }

    // Tu tvoja logika...
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      // Tu si sprav log alebo DB operáciu
      strapi.log.info('Stripe checkout.session.completed webhook received:', session.id);
    }

    ctx.response.status = 200;
    ctx.response.body = { received: true };
  },
};
