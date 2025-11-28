export default {
  routes: [
    {
      method: 'POST',
      path: '/orders/:id/packeta/ship',
      handler: 'order.shipPacketa',
      config: {
        // auth: false,  // toto nech je vypnuté
        policies: ['admin::isAuthenticatedAdmin'], // admin guard
      },
    },
  ],
};