'use strict';

type OrderEntity = {
  id: number;
  customerName: string;
  customerEmail: string;
  // doplň podľa potreby...
  deliveryMethod: 'pickup' | 'post_office' | 'packeta_box' | 'post_courier';
  deliveryDetails?: {
    provider?: string;
    packetaBoxId?: string;
    postOfficeId?: string;
    notes?: string;
  } | null;
  deliveryAddress?: {
    street?: string;
    city?: string;
    zip?: string;
    country?: string;
  } | null;
  totalWithShipping?: number;
};

interface PacketaCreateResponse {
    id?: string;
    shipmentId?: string;
    trackingNumber?: string;
    barcode?: string;
    labelUrl?: string;
  }

export default () => ({
  async createShipmentFromOrder(order: OrderEntity) {
    const BASE = process.env.PACKETA_API_BASE || 'https://api.packeta.example/v1';
    const API_KEY = process.env.PACKETA_API_PASSWORD; // podľa tvojho účtu to môže byť X-Api-Key / Authorization
    const SENDER_ID = process.env.PACKETA_SENDER_ID || '';
    if (!API_KEY) throw new Error('Missing PACKETA_API_PASSWORD');

    if (order.deliveryMethod !== 'packeta_box') {
      throw new Error('createShipmentFromOrder called for non-packeta delivery');
    }

    const details = order.deliveryDetails || {};
    const provider = details.provider || 'packeta';
    const isCarrier = provider.startsWith('carrier:');
    const carrierId = isCarrier ? provider.split(':')[1] : null;

    // poskladaj payload – prispôsob presne podľa API (názvy polí sa v účtoch líšia)
    const payload: any = {
      senderId: SENDER_ID || undefined,
      reference: `ORD-${order.id}`,
      cashOnDelivery: 0,
      note: details.notes || '',
      recipient: {
        name: order.customerName,
        email: order.customerEmail,
        // phone: ...
      },
      pickupPoint: isCarrier
        ? { carrierId, carrierPickupPointId: details.packetaBoxId }
        : { packetaPointId: details.packetaBoxId },
      // weight: ..., insurance: ..., etc.
    };

    // ak by to bol kuriér (tu nie), posielala by sa address
    // payload.address = { ...order.deliveryAddress }

    const res = await fetch(`${BASE}/shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Skontroluj v dokumentácii tvojho konta: niekde je 'X-Api-Key', inde 'Authorization: ApiKey ...'
        'X-Api-Key': API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      strapi.log.error('[PACKETA][CREATE] HTTP', res.status, text);
      throw new Error(`Packeta create failed: ${res.status}`);
    }

    const data = (await res.json()) as unknown as PacketaCreateResponse;

    // prispôsob podľa odpovede API
    return {
        shipmentId: data.id || data.shipmentId,
        trackingNumber: data.trackingNumber || data.barcode,
        labelUrl: data.labelUrl || null,
      };
  },
});
