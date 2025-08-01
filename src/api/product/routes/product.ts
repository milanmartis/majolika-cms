export default {
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
};