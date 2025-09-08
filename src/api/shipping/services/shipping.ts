// src/api/shipping/services/shipping.ts

// ⚠️ Nepotrebujeme 'node-fetch' – Node 18+ má fetch globálne

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
   * @param order - objednávka
   * @param opts.weightKg - váha balíka v kilogramoch (voliteľné)
   */
  async createShipmentFromOrder(order: OrderEntity, opts?: { weightKg?: number }) {
    const BASE = process.env.PACKETA_API_BASE || 'https://api.packeta.example/v1';
    const API_KEY = process.env.PACKETA_API_PASSWORD;
    const AUTH_SCHEME = process.env.PACKETA_AUTH_SCHEME || 'X-Api-Key'; // 'X-Api-Key' | 'Authorization'
    const SENDER_ID = process.env.PACKETA_SENDER_ID || '';

    if (!API_KEY) throw new Error('Missing PACKETA_API_PASSWORD');
    if (order.deliveryMethod !== 'packeta_box') {
      throw new Error('Unsupported delivery method for Packeta (expected packeta_box)');
    }

    const details = order.deliveryDetails || {};
    const provider = (details.provider || 'packeta').trim();
    const isCarrier = provider.startsWith('carrier:');
    const carrierId = isCarrier ? provider.split(':')[1] : null;

    const packetaPointId = details.packetaBoxId?.toString().trim();
    if (!packetaPointId) {
      throw new Error('Missing Packeta pickup point (deliveryDetails.packetaBoxId)');
    }

    // ⚖️ Jednoznačný prepočet váhy: ak máš env PACKETA_WEIGHT_UNITS=grams, konvertuj
    const WEIGHT_UNITS = (process.env.PACKETA_WEIGHT_UNITS || 'grams').toLowerCase(); // 'grams' | 'kg'
    const weight =
      typeof opts?.weightKg === 'number'
        ? WEIGHT_UNITS === 'grams'
          ? Math.round(opts!.weightKg * 1000)
          : opts!.weightKg
        : undefined;

    const payload: Record<string, any> = {
      senderId: SENDER_ID || undefined,
      reference: `ORD-${order.id}`,
      cashOnDelivery: 0,
      note: details.notes || '',
      recipient: {
        name: order.customerName,
        email: order.customerEmail,
        // phone: ... (ak máš)
      },
      pickupPoint: isCarrier
        ? { carrierId, carrierPickupPointId: packetaPointId }
        : { packetaPointId },
      weight,
      // insurance: ..., services: ...
    };

    // 🔐 Hlavičky podľa schémy
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (AUTH_SCHEME.toLowerCase() === 'authorization') {
      headers.Authorization = `ApiKey ${API_KEY}`;
    } else {
      headers['X-Api-Key'] = API_KEY;
    }

    // ⏱️ Timeout (20s) nech to nezostane visieť
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const res = await fetch(`${BASE}/shipments`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        // Skúsme JSON, ale ak nie je, logni plain text
        let parsed: any = null;
        try {
          parsed = JSON.parse(text);
        } catch (_) {
          /* ignore */
        }
        // @ts-ignore – strapi je globálne dostupné v runtime
        strapi.log.error('[PACKETA][CREATE] HTTP', res.status, parsed || text);
        throw new Error(`Packeta create failed: ${res.status}`);
      }

      let data: PacketaCreateResponse = {};
      try {
        data = JSON.parse(text);
      } catch {
        // @ts-ignore
        strapi.log.warn('[PACKETA][CREATE] Response not JSON, body:', text);
      }

      return {
        shipmentId: data.id || data.shipmentId || null,
        trackingNumber: data.trackingNumber || data.barcode || null,
        labelUrl: data.labelUrl || null,
      };
    } finally {
      clearTimeout(timeout);
    }
  },
});
