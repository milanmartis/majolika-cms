// config/middlewares.ts

export default [
  // Rozšírené logovanie pre debug
  {
    name: 'strapi::logger',
    config: {
      level: 'debug',
    },
  },

  'strapi::errors',

  // ✅ SECURITY + CSP
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          /* Povolené skripty (napr. YouTube) */
          'script-src': [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://www.youtube.com',
          ],
          /* Povolené obrázky */
          'img-src': [
            "'self'",
            'data:',
            'blob:',
            'https://market-assets.strapi.io',
            'https://majolika-cms.appdesign.sk',
            'https://medusa-majolika-s3-us-east.s3.us-east-1.amazonaws.com',
            'https://i.ytimg.com',
          ],
          /* Povolené iframe */
          'frame-src': [
            "'self'",
            'https://www.youtube.com',
            'https://www.youtube-nocookie.com',
          ],
        },
      },
    },
  },

  // ✅ CORS konfigurácia
  {
    name: 'strapi::cors',
    config: {
      origin: [
        'http://localhost:4200',
        'https://staging.d2y68xwoabt006.amplifyapp.com',
        'https://majolika-cms.appdesign.sk',
      ],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
      keepHeaderOnError: true,
    },
  },

  // ✅ Ostatné default middlewares
  'strapi::poweredBy',
  'strapi::query',

  {
    name: 'strapi::body',
    config: {
      jsonLimit: '50mb',
      formLimit: '50mb',
      textLimit: '50mb',
      formidable: {
        maxFileSize: 50 * 1024 * 1024, // 50 MB
      },
      raw: {
        include: ['/api/stripe/webhook'], 
      },
    },
  },

  {
    name: 'strapi::session',
    config: {
      secure: false,       // cookie sa posiela iba cez HTTPS
      sameSite: 'none',   // povolí cross‑origin cookies
      proxy: true,        // DÔVERUJ proxy hlavičkám (X-Forwarded-Proto)
    },
  },

  'strapi::favicon',
  'strapi::public',
];
