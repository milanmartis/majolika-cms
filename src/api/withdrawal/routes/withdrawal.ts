export default {
    routes: [
      {
        method: 'POST',
        path: '/withdrawal',
        handler: 'withdrawal.submit',
        config: {
          auth: false
        }
      }
    ]
  };