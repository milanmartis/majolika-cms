export default {
    routes: [
      {
        method: 'GET',
        path: '/orders/my',
        handler: 'order.my',
        config: { auth: true }
      }
    ]
  };