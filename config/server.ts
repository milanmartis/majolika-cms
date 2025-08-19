import 'dotenv/config';

export default ({ env }: { env: any }) => ({
  url: 'https://majolika-cms.appdesign.sk',
  proxy: true,                 // DÔLEŽITÉ: aby ctx.secure čítal X-Forwarded-Proto
  app: { keys: env.array('APP_KEYS') },
});