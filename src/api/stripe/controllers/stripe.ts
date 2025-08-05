// napr. src/api/stripe/controllers/webhook.ts
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx: any) {
    const sig = ctx.request.headers['stripe-signature']!;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        ctx.request.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      // detailný log
      strapi.log.error('💥 Webhook signature verification failed:', err);
      ctx.status = 400;
      ctx.body = { error: err.message, stack: err.stack };
      return;
    }

    strapi.log.info(`✅ Received event: ${event.type}`);

    // ... spracovanie podľa event.type ...

    ctx.status = 200;
    ctx.body = { received: true };
  },
};
