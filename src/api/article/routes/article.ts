// src/api/article/routes/article.ts

export default {
  routes: [
    {
      method: 'GET',
      path: '/articles/:slug',
      handler: 'article.findBySlug',   // stačí názovControlleru.metóda
      config: { auth: false },
      info: { type: 'content-api' }
    },
  ],
};