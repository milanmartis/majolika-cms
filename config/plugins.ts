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

  // 2) Upload cez AWS S3
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
