// src/api/order/routes/packeta-ship.ts
export default {
    
    routes: [
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

