// src/api/stripe/controllers/stripe.ts (alebo kde máte webhook)

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx: any) {
    const sig = ctx.request.headers['stripe-signature']!;
    const rawBody: Buffer = ctx.request.body;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
      strapi.log.info(`✅ stripe event parsed: ${event.type}`);
    } catch (err: any) {
      strapi.log.error('Webhook signature verification failed:', err.message);
      ctx.status = 400;
      return;
    }

    // len ukážka
    if (event.type === 'payment_intent.succeeded') {
      // … spracujte úspešnú platbu …
    }

    ctx.status = 200;
    ctx.body = { received: true };
  },
};
