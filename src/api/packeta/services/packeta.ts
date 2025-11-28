// src/api/packeta/services/packeta.ts
'use strict';

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

/**
 * Mega-jednoduchy parser:
 * - NEpoužívame xml2js
 * - Len regexmi vytiahneme <result> / <status> / <id> / <barcode> / <errorMessage>
 */
function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
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

    // DEBUG: request
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

    // DEBUG: raw response
    strapi.log.error(
      `[PACKETA][CREATE] RAW RESPONSE HTTP ${res.status} BODY: ${text}`
    );

    if (!res.ok) {
      // tu uvidíš reálnu odpoveď Packety (aj pri 502 / 4xx)
      throw new Error(`Packeta create failed: HTTP ${res.status}`);
    }

    if (!text || !text.trim()) {
      strapi.log.error('[PACKETA][CREATE] Empty response body');
      throw new Error('Packeta empty response body');
    }

    // 🧠 tu nespoliehame na konkrétne tagy – skúsime viac variant:
    const result   = extractTag(text, 'result') || extractTag(text, 'status');
    const errorMsg = extractTag(text, 'errorMessage') || extractTag(text, 'message');

    if (result && result.toLowerCase() !== 'ok') {
      strapi.log.error(
        `[PACKETA][CREATE] LOGIC ERROR result!=ok: ${result || '-'} errorMsg: ${errorMsg || '-'} xml: ${text}`
      );
      throw new Error(errorMsg || `Packeta API error: ${result}`);
    }

    // id môže byť v packetId->id alebo priamo <id>...
    const packetIdBlock = extractTag(text, 'packetId') || text;
    const id      = extractTag(packetIdBlock, 'id') || extractTag(packetIdBlock, 'packetId');
    const barcode = extractTag(packetIdBlock, 'barcode') || extractTag(text, 'barcode');

    if (!id && !barcode) {
      strapi.log.error('[PACKETA][CREATE] Missing id/barcode in response:', text);
      throw new Error('Packeta API: missing id/barcode in response');
    }

    return {
      shipmentId: id || null,
      trackingNumber: barcode || null,
      barcode: barcode || null,
      labelUrl: null, // štítok vieš riešiť neskôr cez packetsLabelsPdf()
    };
  },
});
