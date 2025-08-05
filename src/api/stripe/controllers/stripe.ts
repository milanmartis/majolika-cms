import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx: any) {
    strapi.log.info('––– STRIPE WEBHOOK –––');

    // Jedna deklarácia signature headeru
    const sig = ctx.request.headers['stripe-signature'];
    strapi.log.info('Stripe signature header:', sig);
    strapi.log.info('Using webhook secret:', process.env.STRIPE_WEBHOOK_SECRET);

    if (!Buffer.isBuffer(ctx.request.body)) {
      ctx.status = 400;
      ctx.body = { error: 'Body is not a Buffer' };
      return;
    }
    
    try {
      const event = stripe.webhooks.constructEvent(
        ctx.request.body,             // Buffer z raw parsera
        sig as string,                // stripe-signature header
        process.env.STRIPE_WEBHOOK_SECRET!
      );
      strapi.log.info('Stripe event: ' + event.type);
      ctx.status = 200;
      ctx.body = { received: true };
    } catch (err: any) {
      strapi.log.error('💥 Webhook Error: ' + err.message);
      ctx.status = 400;
      ctx.body = { error: err.message };
    }
  },
};
