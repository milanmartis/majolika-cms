export default {
    routes: [
      // Správne: bez "api::" v handler reťazci
      { method: 'GET', path: '/autors', handler: 'autor.find', config: { auth: false } },
    ],
  } as const;