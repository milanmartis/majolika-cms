import { factories } from '@strapi/strapi';

// Dynamicky rozpoznaj, či je to funkcia alebo pole
const coreRoutesMaybe = factories.createCoreRouter('api::product.product').routes;
const coreRoutes = typeof coreRoutesMaybe === 'function' ? coreRoutesMaybe() : coreRoutesMaybe;

const categoryRoutes = [
  {
    method: 'GET',
    path: '/products/categories/:slug',
    handler: 'product.findByCategory',
    config: {
      policies: [],
      middlewares: [],
    },
  },
];

const eventSessionRoutes = [
  {
    method: 'GET',
    path: '/products/:id/event-sessions',
    handler: 'product.eventSessions',
    config: { policies: [], middlewares: [] },
  },
  {
    method: 'POST',
    path: '/products/:id/event-sessions/:sessionId/book',
    handler: 'product.bookEventSession',
    config: { policies: [], middlewares: [] },
  },
  {
    method: 'POST',
    path: '/products/:id/event-sessions/:sessionId/confirm-paid',
    handler: 'product.confirmPaidBooking',
    config: { policies: [], middlewares: [] },
  },
  {
    method: 'POST',
    path: '/products/:id/event-sessions/:sessionId/cancel/:bookingId',
    handler: 'product.cancelBooking',
    config: { policies: [], middlewares: [] },
  },
];

// ✅ Bez chyby: typovo správne spojené všetky routy
export default {
  routes: [...coreRoutes, ...categoryRoutes, ...eventSessionRoutes],
};
