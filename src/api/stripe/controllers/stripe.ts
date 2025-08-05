import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx: any) {
    strapi.log.info('WEBHOOK CONTROLLER CALLED!');
    const sig = ctx.request.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        ctx.request.body, // toto musí byť Buffer!
        sig!,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      ctx.status = 400;
      ctx.body = `Webhook Error: ${err.message}`;
      return;
    }

    strapi.log.info('Stripe event:', event.type);
    ctx.status = 200;
    ctx.body = { received: true };
  }
};
