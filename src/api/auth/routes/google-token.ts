// src/api/auth/routes/google-token.ts

export default [
    {
      method: 'POST',
      path: '/auth/google-token',
      handler: 'api::auth.google-token.exchange',
      config: {
        auth: false,
      },
    },
  ];