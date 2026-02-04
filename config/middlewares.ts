// config/middlewares.ts

const isProd = process.env.NODE_ENV === 'production';

export default [
  // VLASTNÝ DEBUG MIDDLEWARE
  // { resolve: './src/middlewares/stripe-raw', config: {} },

  // Rozšírené parsovanie tela (vrátane RAW pre Stripe webhooky)
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
            // (voliteľne) ak nasadíš Turnstile, odkomentuj:
            // 'https://challenges.cloudflare.com',
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
            'https://d1hbdvlfav95nt.cloudfront.net',
          ],
          /* Iframe */
          'frame-src': [
            "'self'",
            'https://www.youtube.com',
            'https://www.youtube-nocookie.com',
            // (voliteľne) Turnstile:
            // 'https://challenges.cloudflare.com',
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
        'http://localhost:4200',                      // dev Angular
        'https://staging.dxzvn9ta3v1he.amplifyapp.com', // staging FE
        'https://majolika.sk',
        'https://www.majolika.sk',
        // CMS front (ak odtiaľ vôbec robíš XHR na API):
        'https://majolika-cms.appdesign.sk',
      ],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      headers: [
        'Content-Type',
        'Authorization',
        'Origin',
        'Accept',
        'X-Requested-With',
        'cache-control',
        'pragma',
      ],
      credentials: true,
      keepHeaderOnError: true,
    },
  },


  // ✅ PoweredBy a query parser
  // ✅ PoweredBy a query parser
  'strapi::poweredBy',
  'strapi::query',

  // 🔒 Rate-limit a veľkostná kontrola pre /api/newsletter/subscribe
  // (umiestnené ešte pred session/public, aby chytilo request včas)
  { name: 'global::newsletter-guard' },

  // Session – secure v produkcii; pre cross-site potrebuje Secure + vhodné SameSite
  {
    name: 'strapi::session',
    config: {
      key: 'strapi.sid',
      secure: true,      // Secure cookie v prod
      sameSite: 'lax',   // ak by si riešil cross-site cookies, zváž 'none' + HTTPS
    },
  },

  'strapi::favicon',
  'strapi::public',

  // Custom debug webhook middleware (ak ho používaš)
  { resolve: './src/middlewares/debug-webhook', config: {} },
];
