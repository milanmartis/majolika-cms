import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx) {
    const sig = ctx.request.headers['stripe-signature']!;
    const payload = ctx.request.body;          // bude Buffer
    try {
      const event = stripe.webhooks.constructEvent(
        payload,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
      strapi.log.info(`✅ Received event: ${event.type}`);
      // … tvoje spracovanie eventu …
      ctx.status = 200;
      ctx.body = { received: true };
    } catch (err: any) {
      strapi.log.error(`Webhook signature verification failed: ${err.message}`);
      ctx.status = 400;
    }
  },
};