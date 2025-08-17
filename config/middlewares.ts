// config/middlewares.ts

const isProd = process.env.NODE_ENV === 'production';

export default [
  // VLASTNÝ DEBUG MIDDLEWARE
  // { resolve: './src/middlewares/stripe-raw', config: {} },

  // Rozšírené logovanie pre debug
  {
    name: 'strapi::body',
    config: {
      includeUnparsed: true,
      parser: {
        enabled: true,
        jsonLimit: '1mb',
        formLimit: '56kb',
        textLimit: '56kb',
        formidable: { maxFileSize: 50 * 1024 * 1024 },
        // RAW body pre Stripe webhooky (pokrýva obidve cesty)
        raw: {
          include: ['/api/stripe/webhook', '/stripe/webhook'],
        },
      },
    },
  },

  {
    name: 'strapi::logger',
    config: {
      level: 'debug',
    },
  },

  'strapi::errors',

  // ✅ SECURITY + CSP (doplnky pre CKEditor a spol.)
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          /* Povolené skripty (YouTube + CKEditor) */
          'script-src': [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://www.youtube.com',
            'https://cdn.ckeditor.com',
          ],
          /* Štýly (CKEditor) */
          'style-src': [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.ckeditor.com',
          ],
          /* Fonty (CKEditor) */
          'font-src': [
            "'self'",
            'data:',
            'https://cdn.ckeditor.com',
          ],
          /* XHR/Event proxy (CKEditor telemetry) */
          'connect-src': [
            "'self'",
            'https:',
            'https://proxy-event.ckeditor.com',
          ],
          /* Obrázky */
          'img-src': [
            "'self'",
            'data:',
            'blob:',
            'https://market-assets.strapi.io',
            'https://majolika-cms.appdesign.sk',
            'https://medusa-majolika-s3-us-east.s3.us-east-1.amazonaws.com',
            'https://i.ytimg.com',
          ],
          /* Médiá (napr. S3) */
          'media-src': [
            "'self'",
            'data:',
            'blob:',
            'https://medusa-majolika-s3-us-east.s3.us-east-1.amazonaws.com',
          ],
          /* Iframe */
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

  // Session – secure len v produkcii; pre cross-site potrebuje SameSite=None + Secure
  {
    name: 'strapi::session',
    config: {
      secure: isProd,                     // v produkcii vyžaduj HTTPS
      sameSite: isProd ? 'none' : 'lax',  // v dev povolenejšie
      proxy: true,                        // dôveruj X-Forwarded-* hlavičkám
    },
  },

  'strapi::favicon',
  'strapi::public',

  // Custom debug webhook middleware (ak ho používaš)
  { resolve: './src/middlewares/debug-webhook', config: {} },
];
