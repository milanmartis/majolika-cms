export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    sessions: {
      accessTokenLifespan: 90,        // 15 min
      idleRefreshTokenLifespan: 90, // 1 deň nečinnosti
      maxRefreshTokenLifespan: 90,// 30 dní absolútne max
      idleSessionLifespan: 90,       // 30 min nečinnosti
      maxSessionLifespan: 90,     // 30 dní absolútne max
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
