// src/api/packeta/services/packeta.ts
'use strict';

import { parseStringPromise } from 'xml2js'; // pridaj do package.json

type OrderEntity = {
  id: number;
  customerName: string;
  customerEmail: string;
  deliveryMethod: 'pickup' | 'post_office' | 'packeta_box' | 'post_courier' | 'digital_product';
  deliveryDetails?: {
    provider?: string;
    packetaBoxId?: string;
    postOfficeId?: string;
    notes?: string;
  } | null;
  totalWithShipping?: number;
};

interface PacketaCreateResponse {
  shipmentId?: string;
  trackingNumber?: string;
  barcode?: string;
}

export default () => ({
  async createShipmentFromOrder(order: OrderEntity, opts?: { weightKg?: number }) {
    const API_URL  = process.env.PACKETA_API_BASE || 'https://www.zasilkovna.cz/api/rest';
    const PASSWORD = process.env.PACKETA_API_PASSWORD;
    if (!PASSWORD) throw new Error('Missing PACKETA_API_PASSWORD');

    if (order.deliveryMethod !== 'packeta_box') {
      throw new Error('createShipmentFromOrder called for non-packeta delivery');
    }

    const details = order.deliveryDetails || {};
    const weightKg = opts?.weightKg ?? 1;

    // 1) poskladáme XML podľa Packeta createPacket()
    const xmlBody = `
      <packet>
        <apiPassword>${PASSWORD}</apiPassword>
        <createPacket>
          <packetAttributes>
            <number>ORD-${order.id}</number>
            <recipientName>${order.customerName}</recipientName>
            <recipientEmail>${order.customerEmail}</recipientEmail>
            <recipientPhone></recipientPhone>
            <weight>${Math.round(weightKg * 1000)}</weight> <!-- v gramoch -->
            <value>${Math.round((order.totalWithShipping || 0) * 100)}</value> <!-- v centoch -->
            <pickupPoint>${details.packetaBoxId || ''}</pickupPoint>
            <note>${details.notes || ''}</note>
          </packetAttributes>
        </createPacket>
      </packet>
    `.trim();

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body: xmlBody,
    });

    const text = await res.text();
    if (!res.ok) {
      strapi.log.error('[PACKETA][CREATE] HTTP', res.status, text);
      throw new Error(`Packeta create failed: ${res.status}`);
    }

    // 2) odpoveď je XML → preparse
    const xml = await parseStringPromise(text, { explicitArray: false });

    // úspech: xml.response.result === 'ok', barcode v xml.response.packetId.barcode
    const response = xml?.response || xml;
    if (response?.result !== 'ok') {
      const msg = response?.errorMessage || 'Packeta API error';
      throw new Error(msg);
    }

    const packetId = response.packetId || {};
    const barcode  = packetId.barcode;

    return {
      shipmentId: packetId.id || null,
      trackingNumber: barcode || null,
      labelUrl: null, // label sa rieši cez ďalšiu metódu packetsLabelsPdf()
    } as PacketaCreateResponse;
  },
});
