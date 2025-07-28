// config/plugins.ts

export default ({ env }) => {
  // 1) Spočítame si redirect URI a vypíšeme ho do logu
  const REDIRECT_URI = env('FRONTEND_URL') + '/login-success';
  console.log('🔑 Strapi Google redirectUri:', REDIRECT_URI);

  // 2) Vrátime konfiguráciu všetkých pluginov
  return {
    // Internationalization
    i18n: {
      enabled: true,
      config: {
        locales: ['sk', 'en', 'de'],
        defaultLocale: 'sk',
      },
    },

    // Email cez SMTP (nodemailer)
    email: {
      config: {
        provider: 'nodemailer',
        providerOptions: {
          host: env('SMTP_HOST', 'smtp.m1.websupport.sk'),
          port: env.int('SMTP_PORT', 587),
          secure: false,
          auth: {
            user: env('SMTP_USER'),
            pass: env('SMTP_PASS'),
          },
        },
        settings: {
          defaultFrom: env('EMAIL_DEFAULT_FROM', 'info@appdesign.sk'),
          defaultReplyTo: env('EMAIL_REPLY_TO', 'info@appdesign.sk'),
        },
      },
    },

    // Users & Permissions – Google OAuth
    'users-permissions': {
      config: {
        providers: {
          google: {
            enabled: true,
            clientId:     env('GOOGLE_CLIENT_ID'),
            clientSecret: env('GOOGLE_CLIENT_SECRET'),
            redirectUri:  `${env('PUBLIC_URL')}/api/connect/google/callback`,
          },
        },
      },
    },

    // Upload cez AWS S3
    upload: {
      config: {
        provider: 'aws-s3',
        providerOptions: {
          accessKeyId: env('AWS_ACCESS_KEY_ID'),
          secretAccessKey: env('AWS_ACCESS_SECRET'),
          region: env('AWS_REGION'),
          params: {
            Bucket: env('AWS_S3_BUCKET'),
          },
          rootPath: 'products',
          baseUrl: env('AWS_S3_BASE_URL'),
        },
        actionOptions: {
          upload:       { ACL: undefined },
          uploadStream: { ACL: undefined },
          delete:       {},
        },
      },
    },
  };
};
