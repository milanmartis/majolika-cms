export default {
  routes: [
    { method: 'GET', path: '/event-sessions/ping', handler: 'event-session.ping', config: { auth: false } },

    // tvoj FE používa:
    { method: 'GET', path: '/event-sessions/for-day', handler: 'event-session.listForDay', config: { auth: false } },
    { method: 'GET', path: '/event-sessions/by-range', handler: 'event-session.listForRange', config: { auth: false } },

    // FE používa getSessionsForProduct(slug)
    { method: 'GET', path: '/event-sessions/by-product', handler: 'event-session.findByProductSlug', config: { auth: false } },

    // ✅ nové: podľa documentId
    { method: 'GET', path: '/event-sessions/by-document', handler: 'event-session.byDocument', config: { auth: false } },

    // ICS / calendar endpointy ktoré už máš v controlleri
    { method: 'GET', path: '/event-sessions/:id/ics', handler: 'event-session.icsOne', config: { auth: false } },
    { method: 'GET', path: '/event-sessions.ics', handler: 'event-session.icsFeed', config: { auth: false } },

    { method: 'GET', path: '/event-sessions/calendar', handler: 'event-session.calendar', config: { auth: false } },

    // product calendar
    { method: 'GET', path: '/products/:productId/event-sessions/calendar', handler: 'event-session.productCalendar', config: { auth: false } },
    { method: 'GET', path: '/products/:productId/event-sessions.ics', handler: 'event-session.productIcsFeed', config: { auth: false } },
  ],
} as const;