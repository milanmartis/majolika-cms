export default {
    routes: [
      {
        method: 'POST',
        path: '/auth/register-with-turnstile',
        handler: 'auth.registerWithTurnstile',
        config: {
          auth: false,
        },
      },
    ],
  };