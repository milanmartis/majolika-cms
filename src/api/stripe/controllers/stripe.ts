import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx: any) {
    const sig = ctx.request.headers['stripe-signature']!;
    const rawBody = ctx.request.body as Buffer;

    try {
      const event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
      strapi.log.info(`✅ stripe event parsed: ${event.type}`);
      // tu spracujte podľa event.type...
    } catch (err: any) {
      strapi.log.error(`Webhook signature verification failed: ${err.message}`);
      ctx.status = 400;
      return;
    }

    ctx.status = 200;
    ctx.body = { received: true };
  },
};