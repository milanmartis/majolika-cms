export default {
    routes: [
      {
        method: 'POST',
        path: '/modranska-import',
        handler: 'modranska.run',
        config: {
          auth: false,
        },
      },
    ],
  };