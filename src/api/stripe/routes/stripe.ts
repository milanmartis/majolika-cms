export default {
  routes: [
    {
      method: 'POST',
      path: '/api/stripe/webhook',
      handler: 'stripe.webhook',
      config: {
        auth: false,
        policies: [],
        // žiaden vlastný middleware tu!
      },
    },
  ],
};