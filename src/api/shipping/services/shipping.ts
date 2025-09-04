// src/api/shipping/services/shipping.ts
import fetch from 'node-fetch';

type DeliveryMethod = 'pickup' | 'post_office' | 'packeta_box' | 'post_courier';

type OrderEntity = {
  id: number;
  customerName: string;
  customerEmail: string;
  deliveryMethod: DeliveryMethod;
  deliveryDetails?: {
    provider?: string | null;
    packetaBoxId?: string | null;
    postOfficeId?: string | null;
    notes?: string | null;
  } | null;
  deliveryAddress?: {
    street?: string | null;
    city?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null;
  totalWithShipping?: number | null;
};

interface PacketaCreateResponse {
  id?: string;
  shipmentId?: string;
  trackingNumber?: string;
  barcode?: string;
  labelUrl?: string;
}

export default () => ({
  /**
   * Vytvorí zásielku v Packete z objednávky.
   * opts.weightKg – váha balíka v kilogramoch (voliteľné)
   */
  async createShipmentFromOrder(order: OrderEntity, opts?: { weightKg?: number }) {
    const BASE = process.env.PACKETA_API_BASE || 'https://api.packeta.example/v1';
    const API_KEY = process.env.PACKETA_API_PASSWORD; // niekde je X-Api-Key, inde Authorization
    const SENDER_ID = process.env.PACKETA_SENDER_ID || '';
    if (!API_KEY) throw new Error('Missing PACKETA_API_PASSWORD');

    if (order.deliveryMethod !== 'packeta_box') {
      throw new Error('Unsupported delivery method for Packeta (expected packeta_box)');
    }
    const details = order.deliveryDetails || {};
    const provider = details.provider || 'packeta';
    const isCarrier = provider.startsWith('carrier:');
    const carrierId = isCarrier ? provider.split(':')[1] : null;

    const payload: any = {
      senderId: SENDER_ID || undefined,
      reference: `ORD-${order.id}`,
      cashOnDelivery: 0,
      note: details.notes || '',
      recipient: {
        name: order.customerName,
        email: order.customerEmail,
      },
      pickupPoint: isCarrier
        ? { carrierId, carrierPickupPointId: details.packetaBoxId }
        : { packetaPointId: details.packetaBoxId },
      // ⬇ váha – Packeta často chce gramy; ak tvoje API chce kg, pošli priamo opts?.weightKg
      weight: opts?.weightKg ? Math.round(opts.weightKg * 1000) : undefined,
      // ... prípadne insurance, services, etc.
    };

    const res = await fetch(`${BASE}/shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY, // skontroluj v tvojej Packeta dokumentácii
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      strapi.log.error('[PACKETA][CREATE] HTTP', res.status, text);
      throw new Error(`Packeta create failed: ${res.status}`);
    }

    const data = (await res.json()) as PacketaCreateResponse;

    return {
      shipmentId: data.id || data.shipmentId || null,
      trackingNumber: data.trackingNumber || data.barcode || null,
      labelUrl: data.labelUrl || null,
    };
  },
});
