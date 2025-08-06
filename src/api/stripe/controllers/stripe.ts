import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx: any) {
    // pull the raw buffer that Strapi saved for us
    const rawBody = ctx.request.body?.[Symbol.for('unparsedBody')];
    const sig     = ctx.request.headers['stripe-signature'];

    if (!rawBody || !sig) {
      ctx.status = 400;
      ctx.body   = { error: 'Missing webhook signature or body' };
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      strapi.log.error(`🔴 Webhook signature verification failed: ${err.message}`);
      ctx.status = 400;
      return;
    }

    strapi.log.info(`✅ Received event: ${event.type}`);
    // handle the ones you care about
    if (event.type === 'payment_intent.succeeded') {
      // …
    }

    ctx.status = 200;
    ctx.body   = { received: true };
  },
};