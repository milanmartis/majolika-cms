import Stripe from 'stripe';
import { get } from 'env-var';

const stripe = new Stripe(get('STRIPE_SECRET_KEY').required().asString());

export default {
  async create(ctx) {
    try {
      const payload = ctx.request.body;
      const { customer, items } = payload;

      if (!customer || !items || !Array.isArray(items)) {
        ctx.throw(400, 'Missing or invalid checkout payload');
      }

      const line_items = items.map(item => ({
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Product ${item.productId}`,
          },
          unit_amount: 1000, // TODO: nacitaj skutočnú cenu
        },
        quantity: item.quantity,
      }));

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items,
        customer_email: customer.email,
        success_url: `${get('FRONTEND_URL').required().asString()}/success`,
        cancel_url: `${get('FRONTEND_URL').required().asString()}/cancel`,
        metadata: {
          customerId: customer.id,
        },
      });

      ctx.send({ url: session.url });
    } catch (err) {
      ctx.throw(500, 'Checkout failed');
    }
  },
};
