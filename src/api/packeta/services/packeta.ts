// src/api/packeta/services/packeta.ts
'use strict';

import { parseStringPromise } from 'xml2js';

type OrderEntity = {
  id: number;
  customerName: string;    // "Meno Priezvisko"
  customerEmail: string;
  deliveryMethod: 'pickup' | 'post_office' | 'packeta_box' | 'post_courier' | 'digital_product';
  deliveryDetails?: {
    provider?: string;
    packetaBoxId?: string;   // sem si pri uložení objednávky daj addressId z widgetu
    postOfficeId?: string;
    notes?: string;
    phone?: string;
  } | null;
  totalWithShipping?: number; // v €
};

interface PacketaCreateResponse {
  shipmentId?: string | null;
  trackingNumber?: string | null;
  barcode?: string | null;
  labelUrl?: string | null;
}

function escapeXml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default () => ({
  async createShipmentFromOrder(order: OrderEntity, opts?: { weightKg?: number }): Promise<PacketaCreateResponse> {
    const API_URL  = process.env.PACKETA_API_BASE || 'https://www.zasilkovna.cz/api/rest';
    const PASSWORD = process.env.PACKETA_API_PASSWORD;
    const ESHOP    = process.env.PACKETA_ESHOP_NAME || 'majolika.sk'; // nastav podľa seba

    if (!PASSWORD) throw new Error('Missing PACKETA_API_PASSWORD');

    if (order.deliveryMethod !== 'packeta_box') {
      throw new Error('createShipmentFromOrder called for non-packeta delivery');
    }

    const details  = order.deliveryDetails || {};
    const weightKg = opts?.weightKg ?? 1;

    // rozbitie mena na name + surname (iba jednoduché splitnutie)
    const [firstName, ...rest] = (order.customerName || '').trim().split(' ');
    const surname = rest.join(' ') || firstName || 'Customer';

    const totalValue = order.totalWithShipping ?? 0;

    // !!! Dôležité: správny tvar XML pre createPacket
    const xmlBody = `
      <createPacket>
        <apiPassword>${escapeXml(PASSWORD)}</apiPassword>
        <packetAttributes>
          <number>ORD-${escapeXml(order.id)}</number>
          <name>${escapeXml(firstName || 'Customer')}</name>
          <surname>${escapeXml(surname || 'Unknown')}</surname>
          <email>${escapeXml(order.customerEmail)}</email>
          <phone>${escapeXml(details.phone || '')}</phone>
          <addressId>${escapeXml(details.packetaBoxId || '')}</addressId>
          <value>${totalValue.toFixed(2)}</value>
          <eshop>${escapeXml(ESHOP)}</eshop>
          <weight>${Math.round(weightKg * 1000)}</weight>
          <note>${escapeXml(details.notes || '')}</note>
        </packetAttributes>
      </createPacket>
    `.trim();

    // na debugovanie si to kľudne zaloguj
    strapi.log.debug('[PACKETA][CREATE] XML request:', xmlBody);

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Accept': 'text/xml,application/xml',
      },
      body: xmlBody,
    });

    const text = await res.text();

    if (!res.ok) {
      // tu uvidíš reálnu odpoveď Packety (aj pri 502)
      strapi.log.error('[PACKETA][CREATE] HTTP', res.status, text);
      throw new Error(`Packeta create failed: HTTP ${res.status}`);
    }

    const xml = await parseStringPromise(text, { explicitArray: false });

    // typická odpoveď:
    // <response>
    //   <result>ok</result>
    //   <packetId>
    //     <id>123456789</id>
    //     <barcode>Z1234567890</barcode>
    //   </packetId>
    // </response>
    const response = xml?.response || xml;

    if (response?.result !== 'ok') {
      const msg = response?.errorMessage || 'Packeta API error';
      strapi.log.error('[PACKETA][CREATE] LOGIC ERROR', msg, response);
      throw new Error(msg);
    }

    const packetId = response.packetId || {};
    const barcode  = packetId.barcode || null;

    return {
      shipmentId: packetId.id || null,
      trackingNumber: barcode,
      barcode,
      labelUrl: null, // rieši sa cez packetsLabelsPdf()
    };
  },
});
