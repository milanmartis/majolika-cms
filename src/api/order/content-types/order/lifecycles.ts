// src/api/order/content-types/order/lifecycles.ts
export default {
    async beforeUpdate(event) {
      const { data, where } = event.params;
      strapi.log.info(`[ORDER][beforeUpdate] id=${where?.id} payload=${JSON.stringify(data)}`);
    },
  };