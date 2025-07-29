export default {
  routes: [
    {
      method: 'POST',
      path: '/checkout',
      handler: 'api::checkout.checkout.create',
      config: {
        auth: false,
      },
      info: { type: 'content-api' },
    },
  ],
};