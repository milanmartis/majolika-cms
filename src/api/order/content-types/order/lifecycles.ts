// src/api/order/content-types/order/lifecycles.ts
export default {
    async beforeCreate(event: any) {
      const d = event.params?.data ?? (event.params.data = {});
      if (!d.paymentStatus) d.paymentStatus = 'unpaid';
      if (!d.fulfillmentStatus) d.fulfillmentStatus = 'new';
    },
  
    async beforeUpdate(event: any) {
      const d = event.params?.data ?? (event.params.data = {});
      // nechávame pôvodnú hodnotu, ak pole neprišlo vôbec
      if ('paymentStatus' in d && !d.paymentStatus) d.paymentStatus = 'unpaid';
      if ('fulfillmentStatus' in d && !d.fulfillmentStatus) d.fulfillmentStatus = 'new';
    },
  };
  