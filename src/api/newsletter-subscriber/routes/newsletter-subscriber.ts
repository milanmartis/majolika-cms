export default {
    routes: [
      {
        method: 'POST',
        path: '/newsletter/subscribe',
        handler: 'newsletter-subscriber.subscribe',
        config: {
          auth: false,
          policies: [], // zváž rate-limit / captcha
        },
      },
      {
        method: 'GET',
        path: '/newsletter/confirm',
        handler: 'newsletter-subscriber.confirm',
        config: { auth: false },
      },
      {
        method: 'POST',
        path: '/newsletter/unsubscribe',
        handler: 'newsletter-subscriber.unsubscribe',
        config: { auth: false },
      }
    ]
  };
  