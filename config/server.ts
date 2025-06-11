import 'dotenv/config';
// config/server.ts
export default ({ env }: { env: any }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  proxy: true,
  app: {
    keys: env.array('APP_KEYS', [
      'defaultKey1DefaultKey1DefaultKey1Def', 
      'defaultKey2DefaultKey2DefaultKey2Def',
    ]),
  },
});