import Stripe from 'stripe';
import 'dotenv/config';

export default {
  async createSession({
    items,
    customer,
  }: {
    items: any[];
    customer: {
      id: number;
      name: string;
      email: string;
      street: string;
      city: string;
      zip: string;
      country: string;
    };
  }) {
    // 0) Over env
    const secret = process.env.STRIPE_SECRET;
    if (!secret) {
      throw new Error('Missing STRIPE_SECRET env var');
    }

    // 1) Stripe inštancia
    const stripe = new Stripe(secret, {
      apiVersion: '2025-04-30.basil',
    });

    // 2) Načítanie produktov z DB
    const products = await Promise.all(
      items.map(async (i) => {
        const product = await strapi.db.query('api::product.product').findOne({
          where: { id: i.productId },
          select: ['id', 'name', 'price'],
        });
        if (!product) {
          throw new Error(`Product not found: ${i.productId}`);
        }
        return product;
      })
    );

    // 3) Príprava line_items pre Stripe
    const line_items = items.map((i) => {
      const p = products.find((p) => p.id === i.productId)!;
      return {
        price_data: {
          currency: 'eur',
          product_data: { name: p.name },
          unit_amount: Math.round(p.price * 100),
        },
        quantity: i.quantity,
      };
    });

    // 4) Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
    });

    // 5) Ak customer.id je 0, vytvoríme nového zákazníka
    let customerId = customer.id;
    if (!customerId || customerId === 0) {
      const newCustomer = await strapi.entityService.create<'api::customer.customer', any>(
        'api::customer.customer',
        {
          data: {
            name: customer.name,
            email: customer.email,
            street: customer.street,
            city: customer.city,
            zip: customer.zip,
            country: customer.country,
          },
        }
      );
      customerId = parseInt(newCustomer.id as unknown as string, 10);
    }

    // 6) Objednávka
    const orderData = {
      customer: customerId,
      customerName: customer.name,
      customerEmail: customer.email,
      shippingAddress: `${customer.street}, ${customer.zip} ${customer.city}, ${customer.country}`,
      total: line_items.reduce(
        (sum, li) => sum + (li.price_data.unit_amount / 100) * li.quantity,
        0
      ),
      items: items.map((i) => {
        const p = products.find((p) => p.id === i.productId)!;
        return {
          product: i.productId,
          quantity: i.quantity,
          unitPrice: p.price,
        };
      }),
      paymentSessionId: session.id,
      paymentStatus: 'unpaid' as const,
    };

    const order = await strapi.entityService.create('api::order.order', {
      data: orderData,
    });

    return { url: session.url, order };
  },
};
