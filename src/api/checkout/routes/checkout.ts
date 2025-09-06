// src/api/checkout/routes/checkout.ts
export default {
  routes: [
    {
      method: 'POST',
      path: '/checkout',
      handler: 'checkout.create',
      config: {
        auth: false, // alebo vlastná policy podľa potreby
      },
    },
  ],
};
