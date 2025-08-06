import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx) {
    const rawBody = ctx.request.body?.[Symbol.for('unparsedBody')];
    const sig     = ctx.request.headers['stripe-signature'];

    if (!rawBody || !sig) {
      return ctx.badRequest('Missing webhook signature or body');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
      strapi.log.info(`✅ Received event: ${event.type}`);
    } catch (err: any) {
      strapi.log.error(`🔴 Webhook signature failed: ${err.message}`);
      return ctx.badRequest(err.message);
    }

    // >>> TU SPRACUJEME EVENT <<<
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      strapi.log.info(`🔎 Looking for order with sessionId: ${session.id}`);

      // Nájdi objednávku podľa paymentSessionId
      const order = await strapi.db.query('api::order.order').findOne({
        where: { paymentSessionId: session.id },
      });

      if (order) {
        // Update objednávky na paid
        await strapi.db.query('api::order.order').update({
          where: { id: order.id },
          data: {
            paymentStatus: 'paid',  // alebo 'succeeded' podľa tvojej logiky
          },
        });
        strapi.log.info(`✅ Updated order #${order.id} to paid`);
      } else {
        strapi.log.error(`❌ No order found for session id ${session.id}`);
      }
    }

    ctx.send({ received: true });
  },
};
