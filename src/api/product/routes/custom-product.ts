export default {
  routes: [
    // ===== tvoje existujúce =====
    {
      method: 'GET',
      path: '/products/categories/:slug',
      handler: 'product.findByCategory',
      config: { policies: [], middlewares: [] },
    },

    // (legacy) podľa lokalizovaného ID
    {
      method: 'GET',
      path: '/products/:id/event-sessions',
      handler: 'product.eventSessions',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/products/:id/event-sessions/:sessionId/book',
      handler: 'product.bookEventSession',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/products/:id/event-sessions/:sessionId/confirm-paid',
      handler: 'product.confirmPaidBooking',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/products/:id/event-sessions/:sessionId/cancel/:bookingId',
      handler: 'product.cancelBooking',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ===== ✅ NOVÉ CANONICAL: podľa documentId =====
    {
      method: 'GET',
      path: '/products/by-document/:documentId/event-sessions',
      handler: 'product.eventSessionsByDocument',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/products/by-document/:documentId/event-sessions/:sessionId/book',
      handler: 'product.bookEventSessionByDocument',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/products/by-document/:documentId/event-sessions/:sessionId/confirm-paid',
      handler: 'product.confirmPaidBookingByDocument',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/products/by-document/:documentId/event-sessions/:sessionId/cancel/:bookingId',
      handler: 'product.cancelBookingByDocument',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
  ],
} as const;