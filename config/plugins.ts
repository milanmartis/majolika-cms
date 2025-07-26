
export default ({ env }: { env: (key: string, defaultValue?: any) => string }) => ({
  i18n: {
    enabled: true,
    config: {
      locales: ['sk', 'en', 'de'],
      defaultLocale: 'sk',
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
        baseUrl: env('AWS_S3_BASE_URL'),
      },
      actionOptions: {
        upload: { ACL: undefined },
        uploadStream: { ACL: undefined },
        delete: {},
      },
    },
  },
});
