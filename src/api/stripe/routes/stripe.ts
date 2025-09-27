export default {
  routes: [
    {
      method: 'POST',
      path: '/payments/create',
      handler: 'api::stripe.stripe.createPayment', // <— sem
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/payments/webhook',
      handler: 'api::stripe.stripe.webhook',       // <— sem
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/payments/status',
      handler: 'api::stripe.stripe.status',        // <— sem
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/payments/ping',
      handler: 'api::stripe.stripe.ping',          // <— sem
      config: { auth: false },
    },
  ],
};