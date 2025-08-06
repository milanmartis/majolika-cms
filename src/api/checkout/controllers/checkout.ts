// Napr. src/api/checkout/controllers/checkout.ts
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async create(ctx) {
    const { items, customer, temporaryId } = ctx.request.body;

    // 1. Vytvor order v Strapi (zapíš temporaryId do objednávky)
    const order = await strapi.entityService.create('api::order.order', {
      data: {
        customerName: customer.name,
        customerEmail: customer.email,
        shippingAddress: {
          street: customer.street,
          city: customer.city,
          zip: customer.zip,
          country: customer.country,
        },
        total: 0, // vypočítaj z items
        status: 'pending',
        temporaryId, // DÔLEŽITÉ
        customer: customer.id,
        // ďalšie polia...
      }
    });

    // 2. Stripe session s temporaryId v metadata
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: items.map(item => ({
        price_data: {
          currency: 'eur',
          product_data: { name: 'Produkt', }, // Uprav podľa produktu
          unit_amount: 1000, // v centoch
        },
        quantity: item.quantity,
      })),
      success_url: `${process.env.FRONTEND_URL}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
      metadata: {
        orderId: order.id,
        temporaryId: temporaryId || '',
        customerEmail: customer.email,
      },
    });

    // 3. Update order s paymentSessionId
    await strapi.db.query('api::order.order').update({
      where: { id: order.id },
      data: { paymentSessionId: session.id },
    });

    ctx.send({ url: session.url });
  }
};
