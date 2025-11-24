// src/api/sitemap/routes/sitemap.ts
export default {
  routes: [
    {
      method: 'GET',
      path: '/sitemap.xml',
      handler: 'sitemap.index',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
