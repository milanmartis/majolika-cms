// src/api/order/content-types/order/lifecycles.ts
const stripStatus = (d: any) => {
  if (d && 'status' in d) delete d.status; // odstráni kolidujúce pole
  return d;
};

const mapDelivery = (v: any) => {
  if (v == null || v === '') return 'label_created';
  const m: Record<string, string> = { 'in-transit': 'in_transit', 'at-pickup': 'at_pickup' };
  const s = String(v).trim();
  return m[s] ?? s;
};

const mapFulfillment = (v: any) => (v == null || v === '' ? 'new' : String(v).trim());

export default {
  async beforeCreate(event) {
    event.params.data ??= {};
    stripStatus(event.params.data);
    event.params.data.fulfillmentStatus = mapFulfillment(event.params.data.fulfillmentStatus);
    event.params.data.deliveryStatus = mapDelivery(event.params.data.deliveryStatus);
  },
  async beforeUpdate(event) {
    const d = (event.params.data ??= {});
    stripStatus(d);
    if ('fulfillmentStatus' in d) d.fulfillmentStatus = mapFulfillment(d.fulfillmentStatus);
    if ('deliveryStatus' in d) d.deliveryStatus = mapDelivery(d.deliveryStatus);

    if (!('fulfillmentStatus' in d) || d.fulfillmentStatus === '') d.fulfillmentStatus = 'new';
    if (!('deliveryStatus' in d) || d.deliveryStatus === '') d.deliveryStatus = 'label_created';

    strapi.log.info(`[ORDER][beforeUpdate] id=${event.params?.where?.id ?? 'doc'} payload=${JSON.stringify(d)}`);
  },
};
