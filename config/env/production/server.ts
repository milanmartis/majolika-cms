import 'dotenv/config';
import fs from 'fs';

export default ({ env }: { env: any }) => ({
  ssl: {
    cert: fs.readFileSync(env('SSL_CERT_PATH')),
    key:  fs.readFileSync(env('SSL_KEY_PATH')),
  },
});
