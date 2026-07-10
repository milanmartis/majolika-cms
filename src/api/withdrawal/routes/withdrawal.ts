export default {
  routes: [
    {
      method: 'POST',
      path: '/withdrawal/check-order',
      handler: 'withdrawal.checkOrder',
      config: {
        auth: false
      }
    },
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