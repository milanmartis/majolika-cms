'use strict';

module.exports = {
  async create(ctx) {
    try {
      const { customer, items } = ctx.request.body;

      strapi.log.info('CHECKOUT PAYLOAD:', customer, items);

      // 1. Over, či zákazník s daným e-mailom existuje
      const existing = await strapi.entityService.findMany('api::customer.customer', {
        filters: { email: customer.email },
        limit: 1,
      });

      let customerId;

      if (existing.length > 0) {
        customerId = existing[0].id;
      } else {
        // 2. Ak nie, vytvor nového
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

      // 3. Vytvor položky objednávky (products musia existovať)
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

      // 4. Stripe session
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: orderItems.map((item) => ({
          price_data: {
            currency: 'eur',
            product_data: {
              name: item.product.title,
            },
            unit_amount: Math.round(item.unitPrice * 100),
          },
          quantity: item.quantity,
        })),
        success_url: `${process.env.FRONTEND_URL}/objednavka-uspesna`,
        cancel_url: `${process.env.FRONTEND_URL}/pokladna`,
        metadata: {
          customerId,
        },
      });

      // 5. Vytvor objednávku v Strapi
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

      ctx.send({ checkoutUrl: session.url });
    } catch (error) {
      strapi.log.error('Checkout error:', error);
      ctx.throw(400, 'Bad Request');
    }
  },
};
