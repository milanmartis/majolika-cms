// src/api/checkout/controllers/checkout.ts
import { randomUUID } from 'node:crypto';

type Item = { productId: number; productName: string; quantity: number; unitPrice: number };
type Payload = {
  items: Item[];
  customer: { id?: number; name: string; email: string; street: string; city: string; zip: string; country: string };
  temporaryId?: string | null;
  paymentMethod: 'card' | 'cod' | 'bank' | 'onsite' | 'post';
  delivery: {
    method: 'pickup' | 'post_office' | 'packeta_box' | 'post_courier';
    address: { street: string; city: string; zip: string; country: string };
    details?: { provider?: string; postOfficeId?: string; packetaBoxId?: string; notes?: string };
  };
};

function shippingFeeOf(method: Payload['delivery']['method']) {
  switch (method) {
    case 'pickup': return 0;
    case 'post_office': return 3.9;
    case 'post_courier': return 4.9;
    case 'packeta_box': return 2.9;
    default: return 0;
  }
}

export default {
  async create(ctx) {
    const body = ctx.request.body as Payload;

    try {
      strapi.log.info('[CHECKOUT][CREATE] body=' + JSON.stringify(body));

      if (!body?.items?.length) ctx.throw(400, 'No items');
      if (!body?.customer?.name || !body?.customer?.email) ctx.throw(400, 'Missing customer name/email');
      if (!body?.delivery?.method) ctx.throw(400, 'Missing delivery.method');
      if (!body?.paymentMethod) ctx.throw(400, 'Missing paymentMethod');
      if (!body?.customer?.id) ctx.throw(400, 'Missing customer.id (relation is required)');

      body.items.forEach(it => {
        if (!it.productId || !it.productName || !it.quantity || !it.unitPrice) {
          ctx.throw(400, 'Invalid item');
        }
      });

      const total = body.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
      const shippingFee = shippingFeeOf(body.delivery.method);
      const totalWithShipping = total + shippingFee;

      const temporaryId = (body.temporaryId && String(body.temporaryId).trim()) || randomUUID();

      const orderData: any = {
        customerName: body.customer.name,
        customerEmail: body.customer.email,
        shippingAddress: {
          street: body.customer.street,
          city: body.customer.city,
          zip: body.customer.zip,
          country: body.customer.country,
        },
        total: total.toFixed(2),
        shippingFee: shippingFee.toFixed(2),
        totalWithShipping: totalWithShipping.toFixed(2),

        status: 'pending',
        paymentMethod: body.paymentMethod,
        paymentStatus: 'unpaid',
        fulfillmentStatus: 'new',
        deliveryStatus: 'label_created', // required v schéme

        deliveryMethod: body.delivery.method,
        deliveryAddress: {
          street: body.delivery.address.street,
          city: body.delivery.address.city,
          zip: body.delivery.address.zip,
          country: body.delivery.address.country,
        },
        deliveryDetails: {
          provider: body.delivery.details?.provider ?? null,
          postOfficeId: body.delivery.details?.postOfficeId ?? null,
          packetaBoxId: body.delivery.details?.packetaBoxId ?? null,
          notes: body.delivery.details?.notes ?? null,
        },
        items: body.items.map(it => ({
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
        customer: body.customer.id,
        temporaryId,
      };

      const created = await strapi.entityService.create('api::order.order', { data: orderData });
      ctx.body = { ok: true, orderId: created.id, temporaryId };
    } catch (e: any) {
      strapi.log.error('[CHECKOUT][CREATE] FAILED message=' + (e?.message || e));
      if (e?.details) strapi.log.error('[CHECKOUT][CREATE] DETAILS=' + JSON.stringify(e.details));
      if (e?.stack) strapi.log.error(e.stack);

      ctx.status = 400;
      ctx.body = { ok: false, error: e?.message || 'Checkout create failed', details: e?.details || null };
    }
  },
};
