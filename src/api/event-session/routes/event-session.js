module.exports = {
    routes: [
      // základné CRUD (aspoň find a findOne)
      {
        method: 'GET',
        path: '/event-sessions',
        handler: 'event-session.find',
        config: {
          auth: false,
        },
      },
      {
        method: 'GET',
        path: '/event-sessions/:id',
        handler: 'event-session.findOne',
        config: {
          auth: false,
        },
      },
  
      // tvoja custom akcia
      {
        method: 'GET',
        path: '/event-sessions/for-day',
        handler: 'event-session.listForDay',
        config: {
          auth: false,
        },
      },
    ],
  };
  