import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx: any) {
    const sig = ctx.request.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        ctx.req.body,  // POZOR: už je Buffer!
        sig!,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      strapi.log.error('Stripe webhook error:', err.message);
      ctx.response.status = 400;
      ctx.response.body = `Webhook Error: ${err.message}`;
      return;
    }

    // Stručné spracovanie
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      // ⬇️ Rob len niečo jednoduché na test!
      strapi.log.info(`Stripe PAID, session: ${session.id}`);
    }

    // Musíš vždy odpovedať Stripe, aj keď sa nič neurobí
    ctx.response.status = 200;
    ctx.response.body = { received: true };
  }
};
