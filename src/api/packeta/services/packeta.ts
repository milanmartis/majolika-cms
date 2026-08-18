// src/api/packeta/services/packeta.ts
'use strict';

type OrderEntity = {
  id: number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  deliveryMethod: 'pickup' | 'post_office' | 'packeta_box' | 'post_courier' | 'digital_product';
  deliveryDetails?: {
    provider?: string;
    packetaBoxId?: string;
    postOfficeId?: string;
    notes?: string;
    phone?: string;
  } | null;
  totalWithShipping?: number;
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

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  let p = phone.replace(/\s+/g, '').replace(/-/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '421' + p.slice(1);     // 09xx -> 4219xx
  // užívateľ môže zadať 4219...
  return p;
}

export default () => ({
  async createShipmentFromOrder(
    order: OrderEntity,
    opts?: { weightKg?: number; codEur?: number; currency?: 'EUR' | 'CZK' | 'HUF' | 'PLN' }
  ): Promise<PacketaCreateResponse> {
    const API_URL  = process.env.PACKETA_API_BASE || 'https://www.zasilkovna.cz/api/rest';
    const PASSWORD = process.env.PACKETA_API_PASSWORD;
    const ESHOP    = process.env.PACKETA_ESHOP_NAME || 'majolika.sk';

    if (!PASSWORD) throw new Error('Missing PACKETA_API_PASSWORD');

    if (order.deliveryMethod !== 'packeta_box') {
      throw new Error('createShipmentFromOrder called for non-packeta delivery');
    }

    const details  = order.deliveryDetails || {};
    const weightKg = opts?.weightKg ?? 1;
    const currency = opts?.currency ?? 'EUR';
    const codEur   = Number(opts?.codEur ?? 0); // 0 = bez dobierky

    const phoneRaw = details.phone || order.customerPhone || '';
    const phone = normalizePhone(phoneRaw);

    // HARD VALIDÁCIE
    if (!details.packetaBoxId) {
      throw new Error('Missing packetaBoxId (addressId from widget)');
    }
    if (!phone) {
      throw new Error('Missing phone for Packeta shipment');
    }

    // rozbitie mena
    const [firstName, ...rest] = (order.customerName || '').trim().split(' ');
    const surname = rest.join(' ') || firstName || 'Customer';

    const totalValue = Number(order.totalWithShipping ?? 0);

    const xmlBody = `
<createPacket>
  <apiPassword>${escapeXml(PASSWORD)}</apiPassword>
  <packetAttributes>
    <number>ORD-${escapeXml(order.id)}</number>
    <name>${escapeXml(firstName || 'Customer')}</name>
    <surname>${escapeXml(surname || 'Unknown')}</surname>
    <email>${escapeXml(order.customerEmail)}</email>

    <phone>${escapeXml(phone)}</phone>
    <addressId>${escapeXml(details.packetaBoxId)}</addressId>

    <value>${totalValue.toFixed(2)}</value>
    <currency>${escapeXml(currency)}</currency>

    <cod>${codEur.toFixed(2)}</cod>
    <codCurrency>${escapeXml(currency)}</codCurrency>

    <eshop>${escapeXml(ESHOP)}</eshop>
    <weight>${weightKg.toFixed(2)}</weight>
    <note>${escapeXml(details.notes || '')}</note>
  </packetAttributes>
</createPacket>
`.trim();

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

    strapi.log.debug(`[PACKETA][CREATE] HTTP ${res.status} BODY: ${text}`);

    if (!res.ok) {
      throw new Error(`Packeta create failed: HTTP ${res.status} body=${text}`);
    }

    if (!text || !text.trim()) {
      throw new Error('Packeta empty response body');
    }

    // výsledok býva rôzny, niekedy aj fault
    const result   = extractTag(text, 'result') || extractTag(text, 'status') || extractTag(text, 'faultCode');
    const errorMsg = extractTag(text, 'errorMessage') || extractTag(text, 'message') || extractTag(text, 'faultString');

    // ak faultCode existuje -> fail
    if (extractTag(text, 'faultCode')) {
      throw new Error(errorMsg || `Packeta fault: ${extractTag(text, 'faultCode')}`);
    }

    if (result && result.toLowerCase() !== 'ok') {
      throw new Error(errorMsg || `Packeta API error: ${result}`);
    }

    const packetIdBlock = extractTag(text, 'packetId') || text;
    const id      = extractTag(packetIdBlock, 'id') || extractTag(packetIdBlock, 'packetId');
    const barcode = extractTag(packetIdBlock, 'barcode') || extractTag(text, 'barcode');

    if (!id && !barcode) {
      throw new Error(`Packeta API: missing id/barcode in response: ${text}`);
    }

    return {
      shipmentId: id || null,
      trackingNumber: barcode || null,
      barcode: barcode || null,
      labelUrl: null,
    };
  },

  /**
   * Stiahne PDF štítok pre danú zásielku (packetId zo shipmentId).
   * Vráti Buffer s PDF (Packeta vracia base64 v <result>).
   */
  async getLabelPdf(
    shipmentId: string,
    opts?: { format?: string; offset?: number }
  ): Promise<Buffer> {
    const API_URL  = process.env.PACKETA_API_BASE || 'https://www.zasilkovna.cz/api/rest';
    const PASSWORD = process.env.PACKETA_API_PASSWORD;

    if (!PASSWORD) throw new Error('Missing PACKETA_API_PASSWORD');
    if (!shipmentId) throw new Error('Missing shipmentId (packetId)');

    const format = opts?.format || process.env.PACKETA_LABEL_FORMAT || 'A6 on A4';
    const offset = Number.isFinite(Number(opts?.offset)) ? Number(opts?.offset) : 0;

    const xmlBody = `
<packetLabelPdf>
  <apiPassword>${escapeXml(PASSWORD)}</apiPassword>
  <packetId>${escapeXml(shipmentId)}</packetId>
  <format>${escapeXml(format)}</format>
  <offset>${offset}</offset>
</packetLabelPdf>`.trim();

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Accept': 'text/xml,application/xml' },
      body: xmlBody,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Packeta label failed: HTTP ${res.status} body=${text.slice(0, 300)}`);
    }
    if (extractTag(text, 'faultCode')) {
      throw new Error(extractTag(text, 'faultString') || extractTag(text, 'string') || 'Packeta label fault');
    }

    const status = extractTag(text, 'status');
    if (status && status.toLowerCase() !== 'ok') {
      throw new Error(extractTag(text, 'string') || `Packeta label API status: ${status}`);
    }

    const b64 = extractTag(text, 'result');
    if (!b64) {
      throw new Error(`Packeta label: chýba <result> v odpovedi: ${text.slice(0, 300)}`);
    }

    return Buffer.from(b64.replace(/\s+/g, ''), 'base64');
  },
});