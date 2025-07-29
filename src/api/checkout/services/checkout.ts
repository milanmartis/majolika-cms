'use strict';

export default () => ({
  async createSession(payload) {
    const { customer, items } = payload;
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    strapi.log.info('CHECKOUT PAYLOAD:', customer, items);

    // 1. Over zákazníka podľa e-mailu
    const existing = await strapi.entityService.findMany('api::customer.customer', {
      filters: { email: customer.email },
      limit: 1,
    });

    let customerId: string | number;

    if (existing.length > 0) {
      customerId = existing[0].id;
    } else {
      const newCustomer = await strapi.entityService.create('api::customer.customer', {
        data: {
          name: customer.name,
          email: customer.email,
          street: customer.street,
          city: customer.city,
          zip: customer.zip,
          country: customer.country,
        },
      });
      customerId = newCustomer.id;
    }

    // 2. Priprav položky objednávky
    const orderItems = await Promise.all(
      items.map(async (item) => {
        const product = await strapi.entityService.findOne('api::product.product', item.productId);
        return {
          product,
          quantity: item.quantity,
          unitPrice: product.price,
        };
      })
    );

    const totalAmount = orderItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    // 3. Stripe session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: orderItems.map((item) => ({
        price_data: {
          currency: 'eur',
          product_data: {
            name: item.product.name,
          },
          unit_amount: Math.round(item.unitPrice * 100),
        },
        quantity: item.quantity,
      })),
      success_url: `${process.env.FRONTEND_URL}/objednavka-uspesna`,
      cancel_url: `${process.env.FRONTEND_URL}/pokladna`,
      metadata: {
        customerId: String(customerId),
      },
    });

    // 4. Vytvor objednávku v DB
    await strapi.entityService.create('api::order.order', {
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
        total: totalAmount,
        items: orderItems,
        paymentSessionId: session.id,
        paymentStatus: 'unpaid',
      },
    });

    return { checkoutUrl: session.url };
  },
});
