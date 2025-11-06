export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    sessions: {
      accessTokenLifespan: 1800,      // 30 min access token
      idleSessionLifespan: 10800,     // 3 h nečinnosti
      maxSessionLifespan: 10800,      // absolútne max 3 h
      idleRefreshTokenLifespan: 10800,// 3 h nečinnosti
      maxRefreshTokenLifespan: 10800, // absolútne max 3 h
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
