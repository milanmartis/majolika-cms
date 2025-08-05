import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx: any) {
    strapi.log.info('WEBHOOK CONTROLLER CALLED!');
    strapi.log.info('typeof body:', typeof ctx.request.body);
    strapi.log.info('isBuffer:', Buffer.isBuffer(ctx.request.body));
    strapi.log.info('body keys:', Object.keys(ctx.request.body));
    const sig = ctx.request.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        ctx.request.body,
        sig!,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      ctx.status = 400;
      ctx.body = `Webhook Error: ${err.message}`;
      strapi.log.error(`Webhook Error: ${err.message}`);
      return;
    }

    strapi.log.info('Stripe event:', event.type);
    ctx.status = 200;
    ctx.body = { received: true };
  }
};
