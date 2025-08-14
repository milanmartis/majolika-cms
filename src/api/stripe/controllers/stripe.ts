import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {


    async ping(ctx) {
      strapi.log.info('[WEBHOOK] ping ok');
      return ctx.send({ ok: true });
    },

  async webhook(ctx) {
    // POZOR: vyžaduje config/middlewares.ts s includeUnparsed: true
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

      // 1) Nájdi order – preferuj metadata.orderId / client_reference_id
      const metaOrderId = session.metadata?.orderId || session.client_reference_id;
      let order = null as any;

      if (metaOrderId) {
        order = await strapi.db.query('api::order.order').findOne({
          where: { id: Number(metaOrderId) },
        });
      }

      // 2) Fallback: paymentSessionId
      if (!order) {
        order = await strapi.db.query('api::order.order').findOne({
          where: { paymentSessionId: session.id },
        });
      }

      // 3) Fallback: payment_intent (ak si ho uložil)
      if (!order && session.payment_intent) {
        order = await strapi.db.query('api::order.order').findOne({
          where: { paymentIntentId: String(session.payment_intent) },
        });
      }

      if (!order) {
        strapi.log.error(`❌ No order found for session ${session.id} (metaOrderId=${metaOrderId || 'none'})`);
        return ctx.send({ received: true, order: null });
      }

      // 4) Doplň temporaryId z metadata, ak chýba
      if (!order.temporaryId && session.metadata?.temporaryId) {
        await strapi.db.query('api::order.order').update({
          where: { id: order.id },
          data: { temporaryId: session.metadata.temporaryId },
        });
        order.temporaryId = session.metadata.temporaryId;
        strapi.log.info(`[PATCH] temporaryId doplnený z metadata: ${order.temporaryId}`);
      }

      // 5) Nastav paymentStatus na 'paid'
      await strapi.db.query('api::order.order').update({
        where: { id: order.id },
        data: { paymentStatus: 'paid' },
      });
      strapi.log.info(`✅ Updated order #${order.id} to paid`);

      // 6) Bookings: najprv tie s temporaryId a orderId == null
      if (order.temporaryId) {
        const res = await strapi.db.query('api::event-booking.event-booking').updateMany({
          where: { temporaryId: order.temporaryId, orderId: null },
          data: { orderId: String(order.id), status: 'paid' },
        });
        strapi.log.info(`✅ Updated ${res.count} bookings (temporaryId=${order.temporaryId}) → orderId=${order.id}, status=paid`);
      } else {
        strapi.log.warn('⚠️ No temporaryId found for this order/session, skipping temporaryId bookings update.');
      }

      // 7) Potvrď paid na všetkých bookingoch s týmto orderId
      const res2 = await strapi.db.query('api::event-booking.event-booking').updateMany({
        where: { orderId: String(order.id) },
        data: { status: 'paid' },
      });
      strapi.log.info(`✅ Updated ${res2.count} bookings to paid for orderId ${order.id} (already paired)`);

      return ctx.send({ received: true });
    }

    // Iné eventy – len ACK





    return ctx.send({ received: true });
  },
};
