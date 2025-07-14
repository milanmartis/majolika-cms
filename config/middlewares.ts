// path: ./config/middlewares.ts
export default [
  'strapi::logger',
  'strapi::errors',

  // ▸ SECURITY + CSP
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          /* 1. Skripty – YouTube player API potrebuje doménu youtube.com  */
          'script-src': [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://www.youtube.com',
          ],

          /* 2. Obrázky – náhľady z i.ytimg.com + vaše S3 bucket-y         */
          'img-src': [
            "'self'",
            'data:',
            'blob:',
            'https://market-assets.strapi.io',
            'https://majolika-cms.appdesign.sk',
            'https://medusa-majolika-s3-us-east.s3.us-east-1.amazonaws.com',
            'https://i.ytimg.com',
          ],

          /* 3. Rámce (iframe) – samotný prehrávač                        */
          'frame-src': [
            "'self'",
            'https://www.youtube.com',
            'https://www.youtube-nocookie.com',
          ],
        },
      },
    },
  },

  // ▸ CORS
  {
    name: 'strapi::cors',
    config: {
      origin: [
        'http://localhost:4200',                                // Angular dev
        'https://staging.d2y68xwoabt006.amplifyapp.com',        // staging FE
        'https://majolika-cms.appdesign.sk',                    // produkčný admin
        'https://eshop.majolika.sk',                            // produkčný FE
      ],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'Accept', 'Cookie'],
      credentials: true,
      keepHeaderOnError: true,
    },
  },

  // ▸ Štandardné middlewares Strapi
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
