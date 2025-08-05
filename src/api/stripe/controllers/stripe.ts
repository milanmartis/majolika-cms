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
      strapi.log.error(`Webhook signature verification failed: ${err.message}`);
      ctx.status = 400;
      return;
    }

    strapi.log.info(`✅ Received event: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        // tu spracuj payment_intent.succeeded...
        break;
      case 'checkout.session.completed':
        // tu spracuj checkout.session.completed...
        break;
      // ... ďalšie prípady, ktoré ťa zaujímajú
      default:
        strapi.log.info(`⚠️  No handler for event type ${event.type}, ignoring.`);
        break;
    }

    // vždy vráť 200 ak sa ti podarilo parse a si v poriadku
    ctx.status = 200;
    ctx.body = { received: true };
  },
};
