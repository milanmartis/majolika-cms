import { factories } from '@strapi/strapi';


const coreRouter = factories.createCoreRouter('api::product.product');

const baseRoutes = typeof coreRouter.routes === 'function'
  ? coreRouter.routes()
  : coreRouter.routes;

export default {
  ...coreRouter,
  routes: [
    ...baseRoutes,
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