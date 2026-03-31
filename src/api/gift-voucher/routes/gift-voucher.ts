export default {
    routes: [
      {
        method: 'POST',
        path: '/gift-vouchers/validate',
        handler: 'gift-voucher.validate',
        config: {
          auth: false
        }
      },
      {
        method: 'POST',
        path: '/gift-vouchers/redeem',
        handler: 'gift-voucher.redeem',
        config: {
          auth: false
        }
      },
      {
        method: 'POST',
        path: '/gift-vouchers/create-for-paid-order',
        handler: 'gift-voucher.createForPaidOrder',
        config: {
          auth: false
        }
      }
    ]
  };