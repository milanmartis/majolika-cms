import 'dotenv/config';

export default ({ env }: { env: any }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),

  // verejná URL backendu
  url: env('SERVER_URL', 'https://majolika-cms.appdesign.sk'),

  // 🔑 toto nechaj ako boolean
  proxy: true,

  // ak naozaj chceš vypnúť bodyParser globálne
  router: {
    bodyParser: false,
  },

  app: {
    keys: env.array('APP_KEYS', [
      'defaultKey1DefaultKey1DefaultKey1Def',
      'defaultKey2DefaultKey2DefaultKey2Def',
    ]),
  },
});