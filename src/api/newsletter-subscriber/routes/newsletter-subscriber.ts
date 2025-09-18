export default {
    routes: [
      {
        method: 'POST',
        path: '/newsletter/subscribe',
        handler: 'api::newsletter-subscriber.newsletter-subscriber.subscribe',
        config: { auth: false },
      },
      {
        method: 'GET',
        path: '/newsletter/confirm',
        handler: 'api::newsletter-subscriber.newsletter-subscriber.confirm',
        config: { auth: false },
      },
      {
        method: 'POST',
        path: '/newsletter/unsubscribe',
        handler: 'api::newsletter-subscriber.newsletter-subscriber.unsubscribe',
        config: { auth: false },
      }
    ]
  };
  