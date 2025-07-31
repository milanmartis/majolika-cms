import coreRouter, { categoryRoutes, eventSessionRoutes } from './product';

const defaultRoutes = Array.isArray(coreRouter.routes)
  ? coreRouter.routes
  : coreRouter.routes();

export default {
  type: 'content-api',
  routes: [
    ...defaultRoutes,
    ...categoryRoutes.routes,
    ...eventSessionRoutes.routes,
  ],
};
