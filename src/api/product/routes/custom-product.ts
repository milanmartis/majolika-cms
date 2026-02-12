export default {
    routes: [
      // -----------------------------
      // Produkty podľa kategórie + filtre
      // -----------------------------
      {
        method: 'GET',
        path: '/products/categories/:slug',
        handler: 'product.findByCategory',
        config: {
          policies: [],
          middlewares: [],
        },
      },
  
      // -----------------------------
      // Event sessions routy
      // -----------------------------
      {
        method: 'GET',
        path: '/products/:id/event-sessions',
        handler: 'product.eventSessions',
        info: { type: 'content-api' },
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: 'POST',
        path: '/products/:id/event-sessions/:sessionId/book',
        handler: 'product.bookEventSession',
        info: { type: 'content-api' },
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: 'POST',
        path: '/products/:id/event-sessions/:sessionId/confirm-paid',
        handler: 'product.confirmPaidBooking',
        info: { type: 'content-api' },
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: 'POST',
        path: '/products/:id/event-sessions/:sessionId/cancel/:bookingId',
        handler: 'product.cancelBooking',
        info: { type: 'content-api' },
        config: {
          policies: [],
          middlewares: [],
        },
      },
    ],
  } as const;
  