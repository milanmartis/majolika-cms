export default {
    routes: [
      {
        method: 'GET',
        path: '/integrations/packeta/select',
        handler: 'packeta.select',
        config: {
          auth: false, // verejne dostupné
        },
      },
    ],
  } as const;