export default {
  routes: [
    {
      method: 'GET',
      path: '/orders/__ping_public',
      handler: 'order.ping',
      config: {
        auth: false,
      },
    },

    {
      method: 'POST',
      path: '/orders/:id/packeta/ship',
      handler: 'order.shipPacketa',
      config: {
        auth: false,                         // 🔹 vypne users-permissions
        // policies: ['admin::isAuthenticatedAdmin'], // 🔹 admin guard
      },
    },
  ],
};
