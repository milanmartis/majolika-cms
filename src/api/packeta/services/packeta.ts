// src/api/packeta/services/packeta.ts
'use strict';

type OrderEntity = {
  id: number;
  customerName: string;    // "Meno Priezvisko"
  customerEmail: string;
  customerPhone?: string | null;
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

// veľmi jednoduchý XML helper: vytiahne obsah <tag>...</tag>
function getXmlTagValue(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
  const m = xml.match(re);
  return m && m[1] ? m[1] : null;
}

export default () => ({
  async createShipmentFromOrder(
    order: OrderEntity,
    opts?: { weightKg?: number }
  ): Promise<PacketaCreateResponse> {
    const API_URL  = process.env.PACKETA_API_BASE || 'https://www.zasilkovna.cz/api/rest';
    const PASSWORD = process.env.PACKETA_API_PASSWORD;
    const ESHOP    = process.env.PACKETA_ESHOP_NAME || 'majolika.sk'; // nastav podľa seba

    if (!PASSWORD) {
      throw new Error('Missing PACKETA_API_PASSWORD');
    }

    if (order.deliveryMethod !== 'packeta_box') {
      throw new Error('createShipmentFromOrder called for non-packeta delivery');
    }

    const details  = order.deliveryDetails || {};
    const weightKgRaw = opts?.weightKg ?? 1;
    const weightKg = weightKgRaw > 0 ? weightKgRaw : 1;

    const totalValueRaw = order.totalWithShipping ?? 0;
    const totalValue = totalValueRaw > 0 ? totalValueRaw : 0;

    // rozbitie mena na name + surname (iba jednoduché splitnutie)
    const [firstName, ...rest] = (order.customerName || '').trim().split(' ');
    const fname = firstName || 'Customer';
    const surname = rest.join(' ') || fname || 'Unknown';

    // telefón – preferuj z objednávky, fallback z deliveryDetails
    const phone =
      (order.customerPhone ?? '').toString().trim() ||
      (details.phone ?? '').toString().trim() ||
      '';

    if (!details.packetaBoxId) {
      // BE ochrana – bez addressId nemá zmysel volať Packetu
      throw new Error('Missing Packeta addressId (packetaBoxId) on order');
    }

    // XML podľa Packeta createPacket
    const xmlBody = `
      <createPacket>
        <apiPassword>${escapeXml(PASSWORD)}</apiPassword>
        <packetAttributes>
          <number>ORD-${escapeXml(order.id)}</number>
          <name>${escapeXml(fname)}</name>
          <surname>${escapeXml(surname)}</surname>
          <email>${escapeXml(order.customerEmail)}</email>
          <phone>${escapeXml(phone)}</phone>
          <addressId>${escapeXml(details.packetaBoxId)}</addressId>
          <value>${escapeXml(totalValue.toFixed(2))}</value>
          <eshop>${escapeXml(ESHOP)}</eshop>
          <weight>${escapeXml(Math.round(weightKg * 1000))}</weight>
          <note>${escapeXml(details.notes || '')}</note>
        </packetAttributes>
      </createPacket>
    `.trim();

    strapi.log.debug('[PACKETA][CREATE] XML request:', xmlBody);

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        Accept: 'text/xml,application/xml',
      },
      body: xmlBody,
    });

    const text = await res.text();

    // HTTP chyba – zaloguj celé telo
    if (!res.ok) {
      strapi.log.error('[PACKETA][CREATE] HTTP', res.status, text);
      throw new Error(`Packeta create failed: HTTP ${res.status}`);
    }

    // Tu už máme 2xx – potrebujeme pozrieť <result> a prípadné errorMessage/id/barcode
    const result = getXmlTagValue(text, 'result');
    const errorMessage = getXmlTagValue(text, 'errorMessage') || getXmlTagValue(text, 'message');

    if ((result && result.toLowerCase() !== 'ok') || (!result && errorMessage)) {
      const msg = errorMessage || 'Packeta API error';
      strapi.log.error('[PACKETA][CREATE] LOGIC ERROR', msg, text);
      throw new Error(msg);
    }

    // Skús vytiahnuť id a barcode
    const shipmentId =
      getXmlTagValue(text, 'id') || // <id> v <packetId>
      getXmlTagValue(text, 'packetId') ||
      null;

    const barcode =
      getXmlTagValue(text, 'barcode') ||
      getXmlTagValue(text, 'trackingNumber') ||
      null;

    if (!shipmentId && !barcode) {
      // nič použiteľné – zaloguj raw XML
      strapi.log.error('[PACKETA][CREATE] Missing id/barcode in response:', text);
      throw new Error('Packeta create failed: missing id/barcode in response');
    }

    return {
      shipmentId,
      trackingNumber: barcode,
      barcode,
      labelUrl: null, // štítok riešiš cez packetsLabelsPdf()
    };
  },
});
