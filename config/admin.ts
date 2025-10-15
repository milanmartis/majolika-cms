export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    sessions: {
      accessTokenLifespan: 30,      // kratší access token (test)
      maxRefreshTokenLifespan: 90,  // voliteľné na test, nech sa nič neobnoví nad 90 s
      maxSessionLifespan: 90,       // ← TVRDÝ LIMIT 90 s
      idleSessionLifespan: 90,      // môže byť rovnaké (nie je nutné)
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
