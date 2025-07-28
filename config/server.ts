import 'dotenv/config';
import fs from 'fs';

export default ({ env }: { env: any }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('SERVER_URL', 'https://majolika-cms.appdesign.sk'),
  proxy: true,
  app: {
    keys: env.array('APP_KEYS', []),
  },
  ssl: {
    // Načítaj výhradne z ENV – nebude sa pokúšať o relatívne cesty
    cert: fs.readFileSync(env('SSL_CERT_PATH')),
    key:  fs.readFileSync(env('SSL_KEY_PATH')),
  },
});