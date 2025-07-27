// config/plugins.ts

export default ({ env }) => ({
  // 1) Internationalization
  i18n: {
    enabled: true,
    config: {
      locales: ['sk', 'en', 'de'],
      defaultLocale: 'sk',
    },
  },
  email: {
    config: {
      provider: 'nodemailer',   // ✅ názov provideru
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
  // 2) Upload cez AWS S3
  'users-permissions': {
    config: {
      email: {
        confirmation: {
          url: `${env('FRONTEND_URL')}/confirm-email`, // ✅ frontendová route
        },
      },
    },
  },
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
        baseUrl: env('AWS_S3_BASE_URL'), // URL cesta k bucketu
      },
      actionOptions: {
        upload:       { ACL: undefined },
        uploadStream: { ACL: undefined },
        delete:       {},
      },
    },
  },
});
