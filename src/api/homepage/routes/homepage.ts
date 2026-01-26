export default {
    routes: [
      {
        method: 'GET',
        path: '/homepage',
        handler: 'homepage.find',
        config: {
          auth: false,
        },
      },
    ],
  };