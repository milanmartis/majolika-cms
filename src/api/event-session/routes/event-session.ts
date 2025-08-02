const routes = [
    {
      method: 'GET',
      path: '/event-sessions/ping',
      handler: 'event-session.ping',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/event-sessions/for-day',
      handler: 'event-session.listForDay',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/event-sessions',
      handler: 'event-session.find',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/event-sessions/:id',
      handler: 'event-session.findOne',
      config: { auth: false },
    },
  ];
  
  export default { routes };
  