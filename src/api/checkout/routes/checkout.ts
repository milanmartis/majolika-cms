export default {
    routes: [
      {
        method: 'POST',
        path: '/checkout',
        handler: 'api::checkout.checkout.create',
        config: {
          // ak nechceš, aby tu bežala autorizácia:
          auth: false,
        },
      },
    ],
  };
  