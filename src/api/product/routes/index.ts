import defaultRouter from './product';
import { categoryRoutes } from './product';
import { eventSessionRoutes } from './product';

const defaultRoutes = typeof defaultRouter.routes === 'function'
  ? defaultRouter.routes()
  : defaultRouter.routes;

export default {
  type: 'content-api',
  routes: [
    ...defaultRoutes,
    ...categoryRoutes.routes,
    ...eventSessionRoutes.routes,
  ],
};
