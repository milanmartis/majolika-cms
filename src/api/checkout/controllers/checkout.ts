import { randomUUID } from 'node:crypto';

type Item = { productId: number; productName: string; quantity: number; unitPrice: number };
type Payload = {
  items: Item[];
  customer: {
    id?: number | string;
    name: string;
    email: string;
    street: string;
    city: string;
    zip: string;
    country: string;
  };
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

async function resolveCustomerId(bodyCustomer: Payload['customer']): Promise<number | string> {
  // 1) ak prišlo ID, over jeho existenciu
  if (bodyCustomer?.id != null) {
    const foundById = await strapi.entityService.findOne('api::customer.customer', bodyCustomer.id as any, {
      fields: ['id'],
    });
    if (foundById?.id != null) return foundById.id;
  }

  // 2) skús dohľadať podľa emailu
  if (bodyCustomer?.email) {
    const foundByEmail = await strapi.db.query('api::customer.customer').findOne({
      where: { email: bodyCustomer.email },
      select: ['id'],
    });
    if (foundByEmail?.id != null) return foundByEmail.id;
  }

  // 3) vytvor nového zákazníka (minimálne meno+email+adresa)
  const created = await strapi.entityService.create('api::customer.customer', {
    data: {
      name: bodyCustomer.name,
      email: bodyCustomer.email,
      street: bodyCustomer.street,
      city: bodyCustomer.city,
      zip: bodyCustomer.zip,
      country: bodyCustomer.country,
    },
  });
  return created.id;
}

export default {
  async create(ctx) {
    const body = ctx.request.body as Payload;

    try {
      strapi.log.info('[CHECKOUT][CREATE] body=' + JSON.stringify(body));

      // --- validácie
      if (!body?.items?.length) ctx.throw(400, 'No items');
      if (!body?.customer?.name || !body?.customer?.email) ctx.throw(400, 'Missing customer name/email');
      if (!body?.delivery?.method) ctx.throw(400, 'Missing delivery.method');
      if (!body?.paymentMethod) ctx.throw(400, 'Missing paymentMethod');

      body.items.forEach((it) => {
        if (!it.productId || !it.productName || !it.quantity || !it.unitPrice) {
          ctx.throw(400, 'Invalid item');
        }
      });

      // --- vyrátaj sumy
      const total = body.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
      const shippingFee = shippingFeeOf(body.delivery.method);
      const totalWithShipping = total + shippingFee;

      // --- temporaryId fallback
      const temporaryId = (body.temporaryId && String(body.temporaryId).trim()) || randomUUID();

      // --- ZÍSKAJ EXISTUJÚCE customer ID (alebo vytvor)
      const customerId = await resolveCustomerId(body.customer);

      // --- mapovanie na api::order.order
      const orderData: any = {
        customerName: body.customer.name,
        customerEmail: body.customer.email,

        shippingAddress: {
          street: body.customer.street,
          city: body.customer.city,
          zip: body.customer.zip,
          country: body.customer.country,
        },

        // DECIMAL je bezpečné posielať ako string
        total: total.toFixed(2),
        shippingFee: shippingFee.toFixed(2),
        totalWithShipping: totalWithShipping.toFixed(2),

        status: 'pending',
        paymentMethod: body.paymentMethod,
        paymentStatus: 'unpaid',
        fulfillmentStatus: 'new',
        deliveryStatus: 'label_created', // required v tvojej schéme

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

        items: body.items.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),

        // ✅ Posielame OVERENÉ existujúce ID
        customer: customerId,

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
