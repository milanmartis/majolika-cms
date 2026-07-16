export default {
  routes: [
    {
      method: 'POST',
      path: '/orders/:id/resend-confirmation',
      handler: 'order.resendConfirmation',
      config: {
        auth: false, // rovnako ako /orders/:id/packeta/ship – volané z admin panela s admin JWT
        // ODPORÚČANÉ zabezpečenie (obmedziť len na admina):
        // policies: ['admin::isAuthenticatedAdmin'],
      },
    },
  ],
};
