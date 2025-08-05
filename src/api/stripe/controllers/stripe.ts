import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx: any) {
    strapi.log.info('––– STRIPE WEBHOOK –––');
    const sig = ctx.request.headers['stripe-signature'];
    strapi.log.info('Stripe signature header:', sig);
    strapi.log.info('Using webhook secret:', process.env.STRIPE_WEBHOOK_SECRET);

    if (!Buffer.isBuffer(ctx.request.body)) {
      strapi.log.error('Body is not Buffer:', ctx.request.body);
      return ctx.badRequest('Body is not a Buffer');
    }

    try {
      const event = stripe.webhooks.constructEvent(
        ctx.request.body,
        sig!,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
      strapi.log.info('▶️ Event type:', event.type);
      ctx.status = 200;
      ctx.body = { received: true };
    } catch (err: any) {
      strapi.log.error('❌ Webhook error:', err.message);
      strapi.log.error(err); // celý stack
      ctx.status = err.message.startsWith('Invalid signature')
        ? 400
        : 500;
      ctx.body = { error: err.message };
    }
  },
};