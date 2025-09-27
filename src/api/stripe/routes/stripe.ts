export default {
  routes: [
    {
      method: 'POST',
      path: '/payments/create',
      handler: 'payment.create',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/payments/webhook',
      handler: 'payment.webhook',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/payments/status',
      handler: 'payment.status',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/payments/ping',
      handler: 'payment.ping',
      config: { auth: false },
    },
  ],
};