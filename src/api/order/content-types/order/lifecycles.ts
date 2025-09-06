// src/api/order/content-types/order/lifecycles.ts
export default {
    async beforeCreate(event: any) {
      const d = event.params?.data ?? (event.params.data = {});
      if (d.paymentStatus === undefined) d.paymentStatus = 'unpaid';
      if (d.fulfillmentStatus === undefined) d.fulfillmentStatus = 'new';
    },
  
    async beforeUpdate(event: any) {
      const d = event.params?.data ?? (event.params.data = {});
      // neprepínaj späť na 'new'; ak sa niekto pokúsi vymazať hodnotu, nech sa ignoruje
      if ('paymentStatus' in d && (d.paymentStatus === '' || d.paymentStatus == null)) {
        delete d.paymentStatus;
      }
      if ('fulfillmentStatus' in d && (d.fulfillmentStatus === '' || d.fulfillmentStatus == null)) {
        delete d.fulfillmentStatus;
      }
    },
  };
  