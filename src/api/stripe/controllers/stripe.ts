import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx: any) {
    strapi.log.info('WEBHOOK CONTROLLER CALLED!');
    strapi.log.info('typeof body: ' + typeof ctx.request.body);
    strapi.log.info('isBuffer: ' + Buffer.isBuffer(ctx.request.body));
    if (!Buffer.isBuffer(ctx.request.body)) {
      ctx.status = 400;
      ctx.body = { error: 'Body is not a Buffer', typeof: typeof ctx.request.body, value: ctx.request.body };
      return;
    }

    const sig = ctx.request.headers['stripe-signature'];
    try {
      const event = stripe.webhooks.constructEvent(
        ctx.request.body, // toto musí byť Buffer
        sig!,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
      strapi.log.info('Stripe event: ' + event.type);
      ctx.status = 200;
      ctx.body = { received: true };
    } catch (err: any) {
      ctx.status = 400;
      ctx.body = { error: `Webhook Error: ${err.message}` };
    }
  }
};
