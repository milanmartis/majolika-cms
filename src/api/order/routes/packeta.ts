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
        auth: false,                         // vypne users-permissions
        // policies: ['admin::isAuthenticatedAdmin'], // pustí len admina
      },
    },
    {
      method: 'GET',
      path: '/orders/:id/packeta/label',
      handler: 'order.packetaLabel',
      config: {
        auth: false,
        // policies: ['admin::isAuthenticatedAdmin'], // odporúčané: obmedziť len na admina
      },
    },
  ],
};
