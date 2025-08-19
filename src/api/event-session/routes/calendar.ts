export default {
    routes: [
      { method: 'GET', path: '/event-sessions/calendar', handler: 'event-session.calendar', config: { auth: false } },
      { method: 'GET', path: '/event-sessions.ics', handler: 'event-session.icsFeed', config: { auth: false } },
      { method: 'GET', path: '/event-sessions/:id/ics', handler: 'event-session.icsOne', config: { auth: false } },
  
      // Per-produkt
      { method: 'GET', path: '/products/:productId/event-sessions/calendar', handler: 'event-session.productCalendar', config: { auth: false } },
      { method: 'GET', path: '/products/:productId/event-sessions.ics', handler: 'event-session.productIcsFeed', config: { auth: false } },
    ],
  } as const;
  