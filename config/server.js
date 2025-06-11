// config/server.js

// načíta .env do process.env aj v produkcii (ak .env existuje)
require('dotenv').config();

module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port:   env.int('PORT', 1337),
  proxy:  true,
  app: {
    keys: env.array('APP_KEYS', [
      // fallback kľúče, ak APP_KEYS nenájdeš v process.env
      'defaultKey1DefaultKey1DefaultKey1Def',
      'defaultKey2DefaultKey2DefaultKey2Def',
    ]),
  },
});