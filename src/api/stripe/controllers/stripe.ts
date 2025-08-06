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
      let order = await strapi.db.query('api::order.order').findOne({
        where: { paymentSessionId: session.id },
      });

      if (!order) {
        strapi.log.error(`❌ No order found for session id: ${session.id}`);
        return ctx.send({ received: true, order: null });
      }

      // 2. PATCH: Doplň temporaryId do order, ak chýba, zo session.metadata
      if (!order.temporaryId && session.metadata && session.metadata.temporaryId) {
        await strapi.db.query('api::order.order').update({
          where: { id: order.id },
          data: { temporaryId: session.metadata.temporaryId },
        });
        order.temporaryId = session.metadata.temporaryId;
        strapi.log.info(`[PATCH] temporaryId doplnený z metadata do order: ${order.temporaryId}`);
      }

      // 3. Update status objednávky na "paid"
      await strapi.db.query('api::order.order').update({
        where: { id: order.id },
        data: { paymentStatus: 'paid' },
      });
      strapi.log.info(`✅ Updated order #${order.id} to paid`);

      // 4. Najskôr update bookings podľa temporaryId a orderId == null
      let bookingsUpdatedByTemporaryId = 0;
      if (order.temporaryId) {
        const res = await strapi.db.query('api::event-booking.event-booking').updateMany({
          where: {
            temporaryId: order.temporaryId,
            orderId: null,
          },
          data: {
            orderId: String(order.id),
            status: 'paid',
          },
        });
        bookingsUpdatedByTemporaryId = res.count;
        strapi.log.info(`✅ Updated ${res.count} bookings (temporaryId=${order.temporaryId}) → orderId=${order.id}, status=paid`);
      } else {
        strapi.log.warn('⚠️ No temporaryId found for this order/session, skipping temporaryId bookings update.');
      }

      // 5. Potom update bookings už spárované na orderId (všetky)
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
