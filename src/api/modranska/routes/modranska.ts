export default {
    routes: [
      {
        method: 'POST',
        path: '/modranska-import',
        handler: 'modranska.run',
        config: { auth: false },
      },
      {
        method: 'POST',
        path: '/modranska-fix-categories',
        handler: 'modranska.fixCategories',
        config: { auth: false },
      },
    ],
  };