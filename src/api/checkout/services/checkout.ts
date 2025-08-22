'use strict';
import Stripe from 'stripe';
import { sendEmail } from '../../../utils/email';

type PaymentMethod = 'card' | 'cod' | 'bank' | 'onsite' | 'post';
type DeliveryMethod = 'pickup' | 'post_office' | 'packeta_box' | 'post_courier';

interface Address {
  street: string;
  city: string;
  zip: string;
  country: string;
}

interface DeliveryDetails {
  provider?: string;         // 'packeta' alebo 'carrier:<id>'
  postOfficeId?: string;     // Slovenská pošta
  packetaBoxId?: string;     // Packeta/Carrier PUDO ID
  notes?: string;            // sumár z widgetu
}

interface Delivery {
  method: DeliveryMethod;
  address?: Address | null;     // pre kuriéra
  details?: DeliveryDetails | null;
}

interface CheckoutItem {
  productId: number;
  productName?: string;
  quantity: number;
  unitPrice: number;
}

interface CheckoutPayload {
  customer: {
    id?: number;
    name: string;
    email: string;
    street: string;
    city: string;
    zip: string;
    country: string;
  };
  items: CheckoutItem[];
  temporaryId?: string | null;
  paymentMethod: PaymentMethod;
  delivery: Delivery;
}

const SHIPPING_PRICING: Record<DeliveryMethod, number> = {
  pickup: 0,
  post_office: 3.9,
  packeta_box: 2.9,
  post_courier: 4.9,
};

function validateDelivery(delivery: Delivery) {
  if (!delivery || !delivery.method) throw new Error('delivery.method is required');

  switch (delivery.method) {
    case 'pickup':
      return;
    case 'post_office': {
      const id = delivery.details?.postOfficeId;
      if (!id) throw new Error('delivery.details.postOfficeId is required for post_office');
      return;
    }
    case 'packeta_box': {
      const boxId = delivery.details?.packetaBoxId;
      if (!boxId) throw new Error('delivery.details.packetaBoxId is required for packeta_box');
      // provider je fajn mať kvôli rozlíšeniu Packeta vs. Carrier PUDO
      if (!delivery.details?.provider) {
        // nezabije checkout, len upozorní do logu
        strapi.log.warn('[DELIVERY] packeta_box bez details.provider — nastavím implicitne "packeta"');
        (delivery.details as DeliveryDetails).provider = 'packeta';
      }
      return;
    }
    case 'post_courier': {
      const a = delivery.address || ({} as Address);
      if (!a.street || !a.city || !a.zip || !a.country) {
        throw new Error('delivery.address is required for post_courier (street, city, zip, country)');
      }
      return;
    }
    default:
      throw new Error(`Unsupported delivery.method: ${String(delivery.method)}`);
  }
}

function summarizeDelivery(delivery: Delivery): string {
  switch (delivery?.method) {
    case 'pickup': return 'Osobné vyzdvihnutie na mieste';
    case 'post_office': return `Na poštu (ID: ${delivery?.details?.postOfficeId})`;
    case 'packeta_box': return delivery?.details?.notes
      ? `Packeta/Carrier box: ${delivery.details.notes}`
      : `Packeta Box (ID: ${delivery?.details?.packetaBoxId})`;
    case 'post_courier': {
      const a = delivery?.address || ({} as Address);
      return `Kuriér na adresu: ${a.street}, ${a.city} ${a.zip}, ${a.country}`;
    }
    default: return String(delivery?.method || '');
  }
}

export default () => ({
  async createSession(payload: CheckoutPayload) {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
    const FRONTEND_URL = process.env.FRONTEND_URL!;
    if (!STRIPE_SECRET_KEY || !FRONTEND_URL) {
      throw new Error('Missing STRIPE_SECRET_KEY or FRONTEND_URL in environment variables.');
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {});
    const { customer, items, temporaryId, paymentMethod, delivery } = payload;

    if (!customer?.email) throw new Error('customer.email is required');
    if (!items?.length) throw new Error('items are required');
    if (!paymentMethod) throw new Error('paymentMethod is required');

    validateDelivery(delivery);

    // 1) nájdi/vytvor zákazníka
    const existing = await strapi.entityService.findMany('api::customer.customer', {
      filters: { email: customer.email },
      limit: 1,
    });
    const customerId = existing.length
      ? existing[0].id
      : (await strapi.entityService.create('api::customer.customer', {
          data: {
            name: customer.name,
            email: customer.email,
            street: customer.street,
            city: customer.city,
            zip: customer.zip,
            country: customer.country,
          },
        })).id;

    // 2) položky objednávky (over produkty, ale cenu berieme z payloadu ako máš)
    const orderItems = await Promise.all(
      items.map(async (item) => {
        const product = await strapi.entityService.findOne('api::product.product', item.productId);
        if (!product || typeof product.price !== 'number') {
          throw new Error(`Produkt s ID ${item.productId} neexistuje alebo nemá cenu.`);
        }
        return {
          product: product.id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice, // ak chceš vynútiť serverovú cenu, vymeň za product.price / salePrice
        };
      })
    );

    const itemsTotal = orderItems.reduce((sum: number, i: any) => sum + i.quantity * i.unitPrice, 0);
    const deliveryMethod: DeliveryMethod = delivery.method;
    const shippingFee = Number(SHIPPING_PRICING[deliveryMethod] ?? 0);
    const totalWithShipping = Number((itemsTotal + shippingFee).toFixed(2));
    const isCard = paymentMethod === 'card';

    // 3) vytvor ORDER podľa tvojej schémy
    const order = await strapi.entityService.create('api::order.order', {
      data: {
        customer: customerId,
        customerName: customer.name,
        customerEmail: customer.email,
        shippingAddress: {
          street: customer.street,
          city: customer.city,
          zip: customer.zip,
          country: customer.country,
        },

        deliveryMethod,
        deliveryAddress: delivery.address || null,
        deliveryDetails: delivery.details || null,

        shippingFee,
        total: itemsTotal,
        totalWithShipping,

        items: orderItems,
        status: 'new',
        paymentMethod,
        paymentStatus: isCard ? 'unpaid' : 'pending',
        paymentSessionId: '',
        temporaryId: temporaryId || null,
      },
    });

    // 4A) NE-KARTA – rovno potvrď a pošli emaily
    if (!isCard) {
      const deliverySummary = summarizeDelivery(delivery);
      try {
        await sendEmail({
          to: customer.email,
          subject: 'Potvrdenie objednávky',
          html: `<p>Dobrý deň, ${customer.name},</p>
                 <p>Vaša objednávka bola prijatá.</p>
                 <p><b>Doručenie:</b> ${deliverySummary}<br/>
                 <b>Doprava:</b> ${shippingFee.toFixed(2)} €<br/>
                 <b>Spolu:</b> ${totalWithShipping.toFixed(2)} €</p>`
        });
        await sendEmail({
          to: 'info@appdesign.sk',
          subject: 'Nová objednávka (ne-kartová platba)',
          html: `<p>Objednávka #${order.id} od ${customer.name} (${customer.email}).</p>
                 <p><b>Doručenie:</b> ${deliverySummary}<br/>
                 <b>Spolu:</b> ${totalWithShipping.toFixed(2)} €</p>`
        });
      } catch (e) {
        strapi.log.error('[ORDER][EMAIL][NON-CARD] send failed:', e);
      }
      return { checkoutUrl: `${FRONTEND_URL}/checkout/success?order=${order.id}` };
    }

    // 4B) KARTA – Stripe Checkout session (doprava ako samostatná položka)
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      ...orderItems.map((item: any) => ({
        price_data: {
          currency: 'eur',
          product_data: { name: item.productName },
          unit_amount: Math.round(item.unitPrice * 100),
        },
        quantity: item.quantity,
      })),
    ];
    if (shippingFee > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: `Doprava (${deliveryMethod})` },
          unit_amount: Math.round(shippingFee * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      success_url: `${FRONTEND_URL}/checkout/success?order=${order.id}`,
      cancel_url: `${FRONTEND_URL}/checkout/cancel?order=${order.id}`,
      metadata: {
        orderId: String(order.id),
        temporaryId: temporaryId || '',
        customerEmail: customer.email,
        deliveryMethod,
        // užitočné meta do webhooku:
        packetaProvider: delivery.details?.provider || '',
        packetaBoxId: delivery.details?.packetaBoxId || '',
      },
    });

    await strapi.db.query('api::order.order').update({
      where: { id: order.id },
      data: { paymentSessionId: session.id },
    });

    return { checkoutUrl: session.url! };
  },
});
