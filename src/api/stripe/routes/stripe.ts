export default {
  routes: [
    {
      method: 'POST',
      path: '/stripe/webhook',
      handler: 'stripe.webhook',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/stripe/webhook/ping',
      handler: 'stripe.ping',
      config: { auth: false },
    },
  ],
};