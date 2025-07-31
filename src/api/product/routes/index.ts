import defaultRouter from './product';
import { categoryRoutes, eventSessionRoutes } from './product';

const defaultRoutes = typeof defaultRouter.routes === 'function'
  ? defaultRouter.routes()
  : defaultRouter.routes;

export default {
  type: 'content-api',
  routes: [
    ...defaultRoutes, // ← teraz je to pole, nie router objekt!
    ...categoryRoutes.routes,
    ...eventSessionRoutes.routes,
  ],
};
