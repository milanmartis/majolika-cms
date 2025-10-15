export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    sessions: {
      accessTokenLifespan: 30,      // 30 s (nech často expiruje)
      maxRefreshTokenLifespan: 90,  // 90 s
      maxSessionLifespan: 90,       // 90 s – tvrdý limit
      idleSessionLifespan: 90,      // 90 s – nepovinné, ale OK
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
