import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx) {
    const rawBody = ctx.request.body?.[Symbol.for('unparsedBody')];
    const sig     = ctx.request.headers['stripe-signature'];

    if (!rawBody || !sig) {
      return ctx.badRequest('Missing webhook signature or body');
    }

    try {
      const event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
      strapi.log.info(`✅ Received event: ${event.type}`);
      // … spracuj …
      ctx.send({ received: true });
    } catch (err: any) {
      strapi.log.error(`🔴 Webhook signature failed: ${err.message}`);
      return ctx.badRequest(err.message);
    }
  },
};