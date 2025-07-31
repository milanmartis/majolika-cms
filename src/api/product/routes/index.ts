import coreRouter from './product';
import { categoryRoutes, eventSessionRoutes } from './product';

export default {
  type: 'content-api',
  routes: [
    // ...coreRouter.routes, // ← toto funguje len ak coreRouter je { routes: [...] }
    ...categoryRoutes.routes,
    ...eventSessionRoutes.routes,
  ],
};
