// src/api/order/routes/packeta-ship.ts
export default {
    
    routes: [
      { method: 'GET',  path: '/orders/__ping_public', handler: 'order.ping',       config: { auth: false } },

      {
        method: 'POST',
        path: '/orders/:id/packeta/ship',
        handler: 'order.shipPacketa', // uprav podľa tvojho controlleru
        config: {
          policies: ['admin::isAuthenticatedAdmin'], // dôležité!
        },
      },
    ],
  };

