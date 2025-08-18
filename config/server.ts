import 'dotenv/config';

export default ({ env }: { env: any }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),

  // verejná HTTPS adresa Strapi (bez koncového /)
  url: 'https://majolika-cms.appdesign.sk',

  // Strapi je za reverse proxy (Nginx)
  proxy: true,

  // (nechaj zapnutý body parser – vypínanie globálne vie rozbiť OAuth)
  // router: { bodyParser: false },   // ❌ ZAKOMENTUJ/ODSTRÁŇ

  app: {
    keys: env.array('APP_KEYS', [
      'defaultKey1DefaultKey1DefaultKey1Def',
      'defaultKey2DefaultKey2DefaultKey2Def',
    ]),
  },
});