const routes = [
    {
      method: 'GET',
      path: '/event-series/:id/generate',
      handler: 'event-series.generate',
      config: { auth: false } // nastav si podľa potreby
    },
    {
      method: 'POST',
      path: '/event-series/:id/bump-and-regenerate',
      handler: 'event-series.bumpAndRegenerate',
      config: { auth: false }
    },
    {
      method: 'PATCH',
      path: '/event-series/:id/bulk-patch-future',
      handler: 'event-series.bulkPatchFutureSessions',
      config: { auth: false }
    },
    {
      method: 'POST',
      path: '/event-series/detach/:sessionId',
      handler: 'event-series.detachSession',
      config: { auth: false }
    }
  ];
  
  export default { routes };
  