import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
});

export default {
  async webhook(ctx: any) {
    const sig = ctx.request.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        ctx.req.body,         // RAW body
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      strapi.log.error('Stripe webhook error:', err.message);
      ctx.status = 400;
      ctx.body = `Webhook Error: ${err.message}`;
      return;
    }

    // 1️⃣ – POZOR: uprav názov modelu, ak máš iný ako order!
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      // 2️⃣ – Nájsť objednávku podľa session.id alebo iného reference
      const order = await strapi.db.query('api::order.order').findOne({
        where: { stripeSessionId: session.id }, // alebo iné pole, podľa tvojej logiky!
      });

      if (order) {
        await strapi.db.query('api::order.order').update({
          where: { id: order.id },
          data: { paymentStatus: 'paid' },
        });
        strapi.log.info(`Order ${order.id} marked as PAID (Stripe webhook)`);
      } else {
        strapi.log.warn(`Order not found for Stripe session.id: ${session.id}`);
      }
    }

    ctx.status = 200;
    ctx.body = { received: true };
  },
};
