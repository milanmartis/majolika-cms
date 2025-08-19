// config/server.ts
import 'dotenv/config';

export default ({ env }: { env: any }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: 'https://majolika-cms.appdesign.sk', 
  app: { keys: env.array('APP_KEYS') },     
  proxy: { koa: true },                     
});