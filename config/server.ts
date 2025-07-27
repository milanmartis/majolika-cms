import 'dotenv/config';
// config/server.ts
export default ({ env }: { env: any }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('SERVER_URL', 'https://staging.d2y68xwoabt006.amplifyapp.com'),
  proxy: true,
  app: {
    keys: env.array('APP_KEYS', [
      'defaultKey1DefaultKey1DefaultKey1Def', 
      'defaultKey2DefaultKey2DefaultKey2Def',
    ]),
  },
});