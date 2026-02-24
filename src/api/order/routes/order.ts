export default {
  routes: [
    {
      method: 'GET',
      path: '/orders/my',
      handler: 'order.my',
      config: { auth: {} },
    },
    {
      method: 'GET',
      path: '/orders/:id/public',
      handler: 'order.publicGet',
      config: { auth: false },
    },
  ],
};