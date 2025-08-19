// config/server.ts
import 'dotenv/config';

export default ({ env }: { env: any }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('SERVER_URL', 'https://majolika-cms.appdesign.sk'),
  proxy: true,

  // vypneme Strapi body parser pre všetky routy
  router: {
    bodyParser: false,
  },

  app: { keys: env.array('APP_KEYS') },
});