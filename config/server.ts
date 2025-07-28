import 'dotenv/config';
import fs from 'fs';

export default ({ env }: { env: any }) => {
  // načítaj cesty z ENV
  const certPath = env('SSL_CERT_PATH', null);
  const keyPath  = env('SSL_KEY_PATH',  null);

  // priprav ssl config, ak máme obe cesty
  const sslConfig = (certPath && keyPath)
    ? {
        cert: fs.readFileSync(certPath),
        key:  fs.readFileSync(keyPath),
      }
    : undefined;

  return {
    host: env('HOST', '0.0.0.0'),
    port: env.int('PORT', 1337),
    url: env('SERVER_URL', 'https://majolika-cms.appdesign.sk'),
    proxy: true,
    app: {
      keys: env.array('APP_KEYS', []),
    },
    // pridáme ssl len ak máme cert + key
    ...(sslConfig ? { ssl: sslConfig } : {}),
  };
};