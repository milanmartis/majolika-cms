export default {
    routes: [
      {
        method: 'GET',
        path: '/event-sessions/sync-to-gcal',
        handler: 'calendar-sync.syncToGcal',
        config: { auth: false } // alebo nastav vlastný admin auth
      },
    ],
  };