import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx) {
    const rawBody = ctx.request.body?.[Symbol.for('unparsedBody')];
    const sig     = ctx.request.headers['stripe-signature'];

    if (!rawBody || !sig) {
      strapi.log.error('❌ Missing webhook signature or body');
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

    // Len naozaj pre checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      strapi.log.info(`🔎 Looking for order with paymentSessionId: ${session.id}`);

      // 1. Nájdi objednávku podľa session id (uložené v paymentSessionId)
      const order = await strapi.db.query('api::order.order').findOne({
        where: { paymentSessionId: session.id },
      });

      if (!order) {
        strapi.log.error(`❌ No order found for session id: ${session.id}`);
        return ctx.send({ received: true, order: null });
      }

      // 2. Nastav paymentStatus na paid
      await strapi.db.query('api::order.order').update({
        where: { id: order.id },
        data: { paymentStatus: 'paid' },
      });
      strapi.log.info(`✅ Updated order #${order.id} to paid`);

      // 3. Všetky bookings s orderId = order.id nastav na paid
      const updatedBookings = await strapi.db.query('api::event-booking.event-booking').updateMany({
        where: { orderId: String(order.id) },
        data: { status: 'paid' },
      });
      strapi.log.info(`✅ Updated ${updatedBookings.count} bookings to paid for orderId ${order.id}`);
    }

    ctx.send({ received: true });
  },
};
