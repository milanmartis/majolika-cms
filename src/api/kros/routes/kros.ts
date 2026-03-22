export default {
    routes: [
      {
        method: 'POST',
        path: '/kros/webhook',
        handler: 'kros.webhook',
        config: { auth: false },
      },
      {
        method: 'POST',
        path: '/kros/orders/:id/send',
        handler: 'kros.sendOrder',
        config: { auth: false },
      },
    ],
  };