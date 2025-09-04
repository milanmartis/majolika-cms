export default {
    routes: [
      {
        method: 'POST',
        path: '/orders/:id/packeta/ship',
        handler: 'order.shipPacketa',
        config: { auth: { scope: ['admin'] } } // iba admin
      }
    ]
  };