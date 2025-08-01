export default {
    routes: [
      {
        method: 'GET',
        path: '/tvar/all',
        handler: 'tvar.findAll',
        config: {
          policies: [],
        },
      },
    ],
  };