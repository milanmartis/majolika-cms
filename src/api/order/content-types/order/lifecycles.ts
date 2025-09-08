// Normalizácia enum hodnôt a defaulty, aby nepadala validácia
const mapDelivery = (v: any) => {
    if (v == null || v === '') return 'label_created';
    // historické aliasy -> nové hodnoty
    const m: Record<string, string> = {
      'in-transit': 'in_transit',
      'at-pickup': 'at_pickup',
    };
    const s = String(v).trim();
    return m[s] ?? s;
  };
  
  const mapFulfillment = (v: any) => {
    if (v == null || v === '') return 'new';
    return String(v).trim();
  };
  
  export default {
    async beforeCreate(event) {
      event.params.data ??= {};
      // garantuj defaulty pri create
      event.params.data.fulfillmentStatus = mapFulfillment(event.params.data.fulfillmentStatus);
      event.params.data.deliveryStatus = mapDelivery(event.params.data.deliveryStatus);
    },
    async beforeUpdate(event) {
      const d = (event.params.data ??= {});
      // normalizuj hodnoty z Adminu (aj keď user mení iné polia)
      if ('fulfillmentStatus' in d) d.fulfillmentStatus = mapFulfillment(d.fulfillmentStatus);
      if ('deliveryStatus' in d) d.deliveryStatus = mapDelivery(d.deliveryStatus);
  
      // Ak by Admin poslal prázdny string, doplň default (vyhneš sa "Invalid status")
      if (!('fulfillmentStatus' in d) || d.fulfillmentStatus === '') d.fulfillmentStatus = 'new';
      if (!('deliveryStatus' in d) || d.deliveryStatus === '') d.deliveryStatus = 'label_created';
  
      // Debug log (na pár pokusov si nechaj zapnuté, potom vymaž)
      strapi.log.info(`[ORDER][beforeUpdate] id=${event.params?.where?.id ?? 'doc'} payload=${JSON.stringify(d)}`);
    },
  };
  