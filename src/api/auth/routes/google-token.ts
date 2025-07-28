// src/api/auth/routes/google-token.ts
export default {
    routes: [
      {
        method: 'POST',
        // bez ďalšieho "/api" v ceste
        path: '/auth/google-token',
        handler: 'google-token.callback',
        config: {
          auth: false,        // nepovolíte anonymný prístup?
          policies: [],
        },
      },
    ],
  };