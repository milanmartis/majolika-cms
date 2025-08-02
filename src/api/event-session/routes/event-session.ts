const routes = [
    {
      method: 'GET',
      path: '/event-sessions/for-day',
      handler: 'event-session.listForDay',
      config: {
        auth: false, // uprav podle toho, jestli má být veřejné
      },
    },
  ];
  
  export default { routes };