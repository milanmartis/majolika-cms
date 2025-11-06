export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    sessions: {
      accessTokenLifespan: 30,       // 30 s
      idleRefreshTokenLifespan: 30,  // 30 s nečinnosti
      maxRefreshTokenLifespan: 90,   // absolútne max 90 s
      idleSessionLifespan: 90,       // 90 s nečinnosti
      maxSessionLifespan: 90,        // absolútne max 90 s
    },
    cookie: {
      path: '/admin',
      sameSite: 'lax',
      // domain: 'majolika-cms.appdesign.sk', // voliteľné, len ak potrebuješ
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
