export default [
  {
    method: 'POST',
    path: '/checkout',
    handler: 'checkout.create',
    config: {
      policies: [],
    },
  },
];