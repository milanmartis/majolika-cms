import 'dotenv/config';

export default ({ env }: { env: any }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('SERVER_URL', 'https://majolika-cms.appdesign.sk'),
  proxy: true,
  app: {
    keys: env.array('APP_KEYS', []),
  },
  // žiadna ssl: sekcia tu!
});