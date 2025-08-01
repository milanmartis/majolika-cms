import { factories } from '@strapi/strapi';

// Core router
const coreRouter = factories.createCoreRouter('api::product.product');

// Získaj core routy
const coreRoutes = Array.isArray(coreRouter.routes)
  ? coreRouter.routes
  : coreRouter.routes();

// Vlastné routy
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
    config: {
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'POST',
    path: '/products/:id/event-sessions/:sessionId/book',
    handler: 'product.bookEventSession',
    config: {
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'POST',
    path: '/products/:id/event-sessions/:sessionId/confirm-paid',
    handler: 'product.confirmPaidBooking',
    config: {
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'POST',
    path: '/products/:id/event-sessions/:sessionId/cancel/:bookingId',
    handler: 'product.cancelBooking',
    config: {
      policies: [],
      middlewares: [],
    },
  },
];

// ✅ Export pre Strapi
export default {
  routes: [...coreRoutes, ...categoryRoutes, ...eventSessionRoutes],
};
