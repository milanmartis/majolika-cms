export default ({ env }) => ({
  auth: {
    // voliteľné: skracuje staré "JWT expiresIn" pre kompatibilitu
    options: { expiresIn: '7d' },
    secret: env('ADMIN_JWT_SECRET'),

    // dôležité: session manažment
    sessions: {
      accessTokenLifespan: 1800,        // 30 min (default)
      maxRefreshTokenLifespan: 2592000, // 30 dní (default)
      idleRefreshTokenLifespan: 604800, // 7 dní (default)
      maxSessionLifespan: 2592000,      // 30 dní (default)
      idleSessionLifespan: 900,         // ← 15 min nečinnosti a admin sa odhlási
    },
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT'),
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY'),
  },
  flags: {
    nps: env.bool('FLAG_NPS', true),
    promoteEE: env.bool('FLAG_PROMOTE_EE', true),
  },
});
