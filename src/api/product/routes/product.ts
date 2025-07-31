// -----------------------------
// 1.  Štandardný REST router
//     (nechávame predvolený core router, aby ostali endpointy find, findOne, create, ...)
// -----------------------------
import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::product.product');

// -----------------------------
// 2.  Custom routy pre „event‑sessions“
//     Uložené v tom istom súbore, exportované cez named export.
//     Strapi načíta *všetky* exporty s vlastnosťou `routes`.


export const categoryRoutes = {
  routes: [
    {
      method: 'GET',
      path: '/products/categories/:slug',
      handler: 'product.findByCategory',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
} as const;

// -----------------------------
export const eventSessionRoutes = {
  routes: [
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