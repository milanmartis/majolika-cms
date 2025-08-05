// config/middlewares.ts

export default [
  // 🔎 DEBUG MIDDLEWARE AKO PRVÝ!
  (ctx, next) => {
    if (ctx.request.url.includes('stripe/webhook')) {
      console.log('--- ALL HEADERS ---');
      console.log(ctx.request.headers);
      console.log('--- RAW BODY ---');
      console.log(ctx.request.body);
      console.log('--- IS BUFFER ---');
      console.log(Buffer.isBuffer(ctx.request.body));
    }
    return next();
  },

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
      include: ['/api/stripe/webhook'],
      raw: { include: ['/api/stripe/webhook'] }, // <<<<<<<<<<<<<<
      jsonLimit: '1mb',
      formLimit: '56kb',
      textLimit: '56kb',
      enableTypes: ['json', 'form', 'text'],
      encoding: 'utf-8',
      strict: true,
      formidable: {
        maxFileSize: 50 * 1024 * 1024,
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
