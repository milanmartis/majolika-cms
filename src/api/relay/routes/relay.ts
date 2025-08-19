export default {
    routes: [
      { method: 'GET', path: '/auth/relay', handler: 'relay.go', config: { auth: false } },
    ],
  };
  