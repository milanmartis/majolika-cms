import Stripe from 'stripe';
import { sendEmail } from '../../../utils/email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

// Lokálny typ odrážajúci tvoju schému `order`
type DeliveryMethod = 'pickup' | 'post_office' | 'packeta_box' | 'post_courier';
type OrderRecord = {
  id: number;
  customerEmail?: string;
  customerName?: string;
  shippingFee?: number | string;
  total?: number | string;
  totalWithShipping?: number | string;
  deliveryMethod?: DeliveryMethod;
  deliveryAddress?: {
    street?: string;
    city?: string;
    zip?: string;
    country?: string;
  } | null;
  deliveryDetails?: {
    provider?: string;
    postOfficeId?: string;
    packetaBoxId?: string;
    notes?: string;
  } | null;
  temporaryId?: string | null;
};

function summarizeDeliveryFromOrder(order: OrderRecord | any): string {
  switch (order?.deliveryMethod) {
    case 'pickup': return 'Osobné vyzdvihnutie na mieste';
    case 'post_office': return `Na poštu (ID: ${order?.deliveryDetails?.postOfficeId || '-'})`;
    case 'packeta_box': return `Packeta Box (ID: ${order?.deliveryDetails?.packetaBoxId || '-'})`;
    case 'post_courier': {
      const a = order?.deliveryAddress || {};
      return `Kuriér na adresu: ${a.street}, ${a.city} ${a.zip}, ${a.country}`;
    }
    default: return String(order?.deliveryMethod || '');
  }
}

export default {
  async ping(ctx) {
    strapi.log.info('[WEBHOOK] ping ok');
    return ctx.send({ ok: true });
  },

  async webhook(ctx) {
    // POZOR: vyžaduje config/middlewares.ts s includeUnparsed: true
    const rawBody = ctx.request.body?.[Symbol.for('unparsedBody') as any];
    const sig = ctx.request.headers['stripe-signature'] as string | undefined;

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

      // 1) Nájdi order – metadata.orderId / client_reference_id / paymentSessionId / payment_intent
      const metaOrderId = session.metadata?.orderId || session.client_reference_id;
      let order: OrderRecord | null = null;

      if (metaOrderId) {
        order = (await strapi.db.query('api::order.order').findOne({
          where: { id: Number(metaOrderId) },
        })) as unknown as OrderRecord | null;
      }
      if (!order) {
        order = (await strapi.db.query('api::order.order').findOne({
          where: { paymentSessionId: session.id },
        })) as unknown as OrderRecord | null;
      }
      if (!order && session.payment_intent) {
        order = (await strapi.db.query('api::order.order').findOne({
          where: { paymentIntentId: String(session.payment_intent) },
        })) as unknown as OrderRecord | null;
      }
      if (!order) {
        strapi.log.error(`❌ No order found for session ${session.id} (metaOrderId=${metaOrderId || 'none'})`);
        return ctx.send({ received: true, order: null });
      }

      // 2) Doplň temporaryId z metadata, ak chýba
      if (!order.temporaryId && session.metadata?.temporaryId) {
        await strapi.db.query('api::order.order').update({
          where: { id: order.id },
          data: { temporaryId: session.metadata.temporaryId },
        });
        order.temporaryId = session.metadata.temporaryId;
        strapi.log.info(`[PATCH] temporaryId doplnený z metadata: ${order.temporaryId}`);
      }

      // 3) Nastav paymentStatus na 'paid'
      await strapi.db.query('api::order.order').update({
        where: { id: order.id },
        data: { paymentStatus: 'paid' },
      });
      strapi.log.info(`✅ Updated order #${order.id} to paid`);

      // 4) Aktualizuj bookingy (tvoj existujúci flow)
      if (order.temporaryId) {
        const res = await strapi.db.query('api::event-booking.event-booking').updateMany({
          where: { temporaryId: order.temporaryId, orderId: null },
          data: { orderId: String(order.id), status: 'paid' },
        });
        strapi.log.info(`✅ Updated ${res.count} bookings (temporaryId=${order.temporaryId}) → orderId=${order.id}, status=paid`);
      } else {
        strapi.log.warn('⚠️ No temporaryId found for this order/session, skipping temporaryId bookings update.');
      }

      const res2 = await strapi.db.query('api::event-booking.event-booking').updateMany({
        where: { orderId: String(order.id) },
        data: { status: 'paid' },
      });
      strapi.log.info(`✅ Updated ${res2.count} bookings to paid for orderId ${order.id}`);

      // 5) Pošli e-maily po úspešnej úhrade
      const freshOrder = (await strapi.entityService.findOne('api::order.order', order.id, {
        populate: ['deliveryAddress', 'deliveryDetails'],
      })) as unknown as OrderRecord;

      const to = session.metadata?.customerEmail || freshOrder.customerEmail;
      const deliverySummary = summarizeDeliveryFromOrder(freshOrder);
      const shippingFee = Number(freshOrder.shippingFee || 0);
      const totalWithShipping = Number(freshOrder.totalWithShipping || freshOrder.total || 0);

      try {
        await sendEmail({
          to,
          subject: 'Potvrdenie objednávky – platba prijatá',
          html: `<p>Ďakujeme, platba za objednávku #${order.id} prebehla úspešne.</p>
                 <p><b>Doručenie:</b> ${deliverySummary}<br/>
                 <b>Doprava:</b> ${shippingFee.toFixed(2)} €<br/>
                 <b>Spolu:</b> ${totalWithShipping.toFixed(2)} €</p>`
        });
        await sendEmail({
          to: 'info@appdesign.sk',
          subject: 'Nová objednávka – platba kartou prijatá',
          html: `<p>Objednávka #${order.id} bola uhradená kartou.</p>
                 <p><b>Doručenie:</b> ${deliverySummary}<br/>
                 <b>Spolu:</b> ${totalWithShipping.toFixed(2)} €</p>`
        });
      } catch (e) {
        strapi.log.error('[STRIPE][WEBHOOK][EMAIL] error:', e);
      }

      // 6) (VOLITEĽNÉ) Packeta po úhrade – ostáva rovnaké, len typy
      try {
        const autoCreate = String(process.env.PACKETA_AUTO_CREATE_ON_PAID || '').toLowerCase() === 'true';
        if (
          autoCreate &&
          freshOrder?.deliveryMethod === 'packeta_box' &&
          freshOrder?.deliveryDetails?.packetaBoxId
        ) {
          strapi.log.info('[PACKETA][AUTO] Creating shipment for order #' + order.id);
          const result = await strapi.service('api::packeta.packeta').createShipmentFromOrder(freshOrder);

          try {
            await strapi.db.query('api::order.order').update({
              where: { id: order.id },
              data: {
                // shipmentId: result?.shipmentId || null,
                // trackingNumber: result?.trackingNumber || null,
                // labelUrl: result?.labelUrl || null,
              },
            });
          } catch (e) {
            strapi.log.info('[PACKETA][AUTO] Shipment created (not persisted in order): ' + JSON.stringify(result));
          }
        }
      } catch (e: any) {
        strapi.log.error('[PACKETA][AUTO] createShipment failed:', e?.message || e);
      }

      return ctx.send({ received: true });
    }

    // Iné eventy – len ACK
    return ctx.send({ received: true });
  },
};
