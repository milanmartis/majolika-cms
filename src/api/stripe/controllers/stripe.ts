// src/api/stripe/controllers/stripe.ts

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx) {
    const rawBody = ctx.request.body?.[Symbol.for('unparsedBody')];
    const sig = ctx.request.headers['stripe-signature'];

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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      strapi.log.info(`🔎 Looking for order with paymentSessionId: ${session.id}`);

      // 1. Nájdi objednávku podľa session.id
      const order = await strapi.db.query('api::order.order').findOne({
        where: { paymentSessionId: session.id },
      });

      if (!order) {
        strapi.log.error(`❌ No order found for session id: ${session.id}`);
        return ctx.send({ received: true, order: null });
      }

      // 2. Update status objednávky na "paid"
      await strapi.db.query('api::order.order').update({
        where: { id: order.id },
        data: { paymentStatus: 'paid' },
      });
      strapi.log.info(`✅ Updated order #${order.id} to paid`);

      // 3. Získaj temporaryId (ideálne z order alebo session.metadata)
      let temporaryId = order.temporaryId;
      // Ak nemáš temporaryId v order, môžeš ho skúsiť vytiahnuť zo Stripe session metadata
      if (!temporaryId && session.metadata && session.metadata.temporaryId) {
        temporaryId = session.metadata.temporaryId;
      }

      let bookingsUpdatedByTemporaryId = 0;
      if (temporaryId) {
        // 4A. Update bookings podľa temporaryId a orderId je null
        const res = await strapi.db.query('api::event-booking.event-booking').updateMany({
          where: {
            temporaryId,
            orderId: null,
          },
          data: {
            orderId: String(order.id),
            status: 'paid',
          },
        });
        bookingsUpdatedByTemporaryId = res.count;
        strapi.log.info(`✅ Updated ${res.count} bookings (temporaryId=${temporaryId}) → orderId=${order.id}, status=paid`);
      } else {
        strapi.log.warn('⚠️ No temporaryId found for this order/session, skipping temporaryId bookings update.');
      }

      // 4B. Update bookings už viazané na orderId
      const res2 = await strapi.db.query('api::event-booking.event-booking').updateMany({
        where: { orderId: String(order.id) },
        data: { status: 'paid' },
      });
      strapi.log.info(`✅ Updated ${res2.count} bookings to paid for orderId ${order.id} (already paired)`);

      ctx.send({ received: true, bookingsUpdatedByTemporaryId, bookingsUpdatedByOrderId: res2.count });
      return;
    }

    ctx.send({ received: true });
  },
};
