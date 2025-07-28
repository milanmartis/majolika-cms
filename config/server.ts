import 'dotenv/config';
import fs from 'fs';
import path from 'path';

export default ({ env }: { env: any }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('SERVER_URL', 'https://majolika-cms.appdesign.sk'),
  proxy: true,
  app: {
    keys: env.array('APP_KEYS', [
      // … vaše kľúče …
    ]),
  },
  ssl: {
    cert: fs.readFileSync(env('SSL_CERT_PATH', path.resolve(__dirname, '../certs/fullchain.pem'))),
    key:  fs.readFileSync(env('SSL_KEY_PATH',  path.resolve(__dirname, '../certs/privkey.pem'))),
  },
});