// src/api/checkout/services/checkout.ts

import Stripe from 'stripe';
import 'dotenv/config';

export default {
  async createSession({ items, customer }: {
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

    // 1) Iniciálna Stripe inštancia
    const stripe = new Stripe(secret, {
      apiVersion: '2025-04-30.basil',
    });

    // 2) Načítame produkty cez Query Engine API
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

    // 3) Pripravíme line_items pre Stripe
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

    // 4) Vytvoríme Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
    });

    // 5) Skladáme orderData vrátane customer
    const orderData = {
      customer: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      shippingAddress: {
        street: customer.street,
        city: customer.city,
        zip: customer.zip,
        country: customer.country,
      },
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

    // 6) Vytvoríme objednávku cez Entity Service
    const order = await strapi.entityService.create('api::order.order', {
      data: orderData,
    });

    return { url: session.url, order };
  },
};
