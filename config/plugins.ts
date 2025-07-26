import nodemailer from 'nodemailer';

export default ({ env }: { env: (key: string, defaultValue?: any) => any }) => ({
  i18n: {
    enabled: true,
    config: {
      locales: ['sk', 'en', 'de'],
      defaultLocale: 'sk',
    },
  },

  email: {
    config: {
      provider: 'custom',   // <<< MUSÍ byť string, inak Strapi volá .toLowerCase()
      providerOptions: {},  // prázdne, lebo si to riešime sami
      settings: {
        defaultFrom: env('EMAIL_DEFAULT_FROM', 'info@appdesign.sk'),
        defaultReplyTo: env('EMAIL_REPLY_TO', 'info@appdesign.sk'),
      },
      // custom send handler
      async send(options) {
        const transporter = nodemailer.createTransport({
          host: env('SMTP_HOST', 'smtp.m1.websupport.sk'),
          port: Number(env('SMTP_PORT', 587)),
          secure: false,
          auth: {
            user: env('SMTP_USER'),
            pass: env('SMTP_PASS'),
          },
        });

        await transporter.sendMail({
          from: env('EMAIL_DEFAULT_FROM', 'info@appdesign.sk'),
          replyTo: env('EMAIL_REPLY_TO', 'info@appdesign.sk'),
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });
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
