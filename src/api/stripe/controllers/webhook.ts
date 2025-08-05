import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default {
  async webhook(ctx: any) {
    const sig = ctx.request.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        ctx.req.body, // RAW buffer!
        sig!,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      ctx.response.status = 400;
      ctx.response.body = `Webhook Error: ${err.message}`;
      return;
    }

    // 1️⃣ Logika pre tvoje objednávky
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      // ... spracuj session.id, update objednávku, atď.
    }

    ctx.response.status = 200;
    ctx.response.body = { received: true };
  }
};
