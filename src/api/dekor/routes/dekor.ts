export default {
    routes: [
      {
        method: 'GET',
        path: '/dekor/all',
        handler: 'dekor.findAll',
        config: {
          policies: [],
        },
      },
    ],
  };