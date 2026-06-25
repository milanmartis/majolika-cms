export default {
    routes: [
      {
        method: 'GET',
        path: '/export/products',
        handler: 'export.products',
        config: {
          auth: false,
        },
      },
    ],
  };