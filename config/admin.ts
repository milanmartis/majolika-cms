export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    sessions: {
      accessTokenLifespan: 180,      // 30 min access token
      idleSessionLifespan: 180,     // 3 h nečinnosti
      maxSessionLifespan: 180,      // absolútne max 3 h
      idleRefreshTokenLifespan: 180,// 3 h nečinnosti
      maxRefreshTokenLifespan: 180, // absolútne max 3 h
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
