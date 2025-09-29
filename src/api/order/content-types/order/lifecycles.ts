// src/api/order/content-types/order/lifecycles.ts
import { sendEmail } from '../../../../utils/email';

type OrderEntity = {
  id: number;
  documentId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  deliveryMethod?: 'pickup' | 'post_office' | 'packeta_box' | 'post_courier';
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
  deliveryStatus?: string | null;
  fulfillmentStatus?: string | null;
  total?: number | null;
};

const ADMIN_EMAIL =
  process.env.ORDER_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'info@appdesign.sk';

// --- tvoje helpery na normalizáciu ---
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

// --- pomocné funkcie na e-maily ---
const statusLabel = (st?: string | null) => {
  if (!st) return '-';
  const map: Record<string, string> = {
    new: 'Nová',
    created: 'Vytvorená',
    processing: 'Spracováva sa',
    label_created: 'Štítok vytvorený',
    in_transit: 'Na ceste',
    at_pickup: 'Na výdajnom mieste',
    shipped: 'Odoslaná',
    delivered: 'Doručená',
    cancelled: 'Zrušená',
    returned: 'Vrátená',
    ready_for_pickup: 'Pripravená na vyzdvihnutie',
  };
  return map[st] || st;
};

const formatAddress = (addr?: OrderEntity['deliveryAddress']) =>
  [addr?.street, addr?.city, addr?.zip, addr?.country].filter(Boolean).join(', ') || '-';

const renderCustomerHtml = (o: OrderEntity, prev: string | null | undefined, next: string) => {
  const addressLine = formatAddress(o.deliveryAddress);
  const method = o.deliveryMethod || '-';
  const details = o.deliveryDetails || {};
  const pointInfo =
    method === 'post_office'
      ? `Pošta ID: ${details.postOfficeId ?? '-'}`
      : method === 'packeta_box'
      ? `Výdajné miesto (Packeta): ${details.packetaBoxId ?? '-'}`
      : '';

  return `
    <p>Dobrý deň${o.customerName ? ', ' + o.customerName : ''},</p>
    <p>stav doručenia vašej objednávky č. <strong>${o.id}</strong> bol zmenený
       z <strong>${statusLabel(prev)}</strong> na <strong>${statusLabel(next)}</strong>.</p>
    <hr>
    <p><strong>Spôsob doručenia:</strong> ${method}</p>
    ${pointInfo ? `<p>${pointInfo}</p>` : ''}
    ${method !== 'packeta_box' ? `<p>Adresa: ${addressLine}</p>` : ''}
    <p>V prípade otázok nám odpovedzte na tento e-mail.</p>
  `;
};

const renderAdminHtml = (o: OrderEntity, prev: string | null | undefined, next: string) => `
  <p><strong>Objednávka #${o.id}</strong> – zmena <code>deliveryStatus</code>:
     <strong>${statusLabel(prev)}</strong> → <strong>${statusLabel(next)}</strong></p>
  <p>Zákazník: ${o.customerName || '-'} &lt;${o.customerEmail || '-'}&gt;</p>
  <p>Spôsob doručenia: ${o.deliveryMethod || '-'}</p>
  ${o.deliveryMethod !== 'packeta_box' ? `<p>Adresa: ${formatAddress(o.deliveryAddress)}</p>` : ''}
  <p>Suma spolu: ${o.total ?? '-'} €</p>
`;

// bezpečné načítanie pôvodnej objednávky podľa id alebo documentId
const fetchPrevOrder = async (event: any): Promise<OrderEntity | null> => {
  try {
    const where = event.params?.where || {};
    const byId = where?.id;
    const byDocId = where?.documentId || event.params?.data?.documentId;

    if (byId) {
      const prev = await strapi.entityService.findOne('api::order.order', byId, {
        populate: ['deliveryAddress', 'deliveryDetails'],
      });
      return (prev as any) || null;
    }

    if (byDocId) {
      // čítame priamo z DB podľa documentId (funguje aj pri documents().update)
      const prev = await strapi.db.query('api::order.order').findOne({
        where: { documentId: byDocId },
        populate: ['deliveryAddress', 'deliveryDetails'],
      });
      return (prev as any) || null;
    }

    return null;
  } catch (e) {
    strapi.log.error('[ORDER][LC] fetchPrevOrder error', e);
    return null;
  }
};

export default {
  // --- pôvodné: normalizácia pri create ---
  async beforeCreate(event) {
    event.params.data ??= {};
    stripStatus(event.params.data);
    event.params.data.fulfillmentStatus = mapFulfillment(event.params.data.fulfillmentStatus);
    event.params.data.deliveryStatus = mapDelivery(event.params.data.deliveryStatus);
  },

  // --- pôvodné: normalizácia + logging pri update + teraz aj cache pôvodného stavu ---
  async beforeUpdate(event) {
    const d = (event.params.data ??= {});
    stripStatus(d);
    if ('fulfillmentStatus' in d) d.fulfillmentStatus = mapFulfillment(d.fulfillmentStatus);
    if ('deliveryStatus' in d) d.deliveryStatus = mapDelivery(d.deliveryStatus);

    if (!('fulfillmentStatus' in d) || d.fulfillmentStatus === '') d.fulfillmentStatus = 'new';
    if (!('deliveryStatus' in d) || d.deliveryStatus === '') d.deliveryStatus = 'label_created';

    // načítaj a ulož pôvodnú objednávku pre porovnanie po update
    try {
      const prev = await fetchPrevOrder(event);
      event.state = event.state || {};
      (event.state as any).prevOrder = prev;
    } catch (e) {
      strapi.log.error('[ORDER][beforeUpdate] prevOrder fetch error', e);
    }

    strapi.log.info(
      `[ORDER][beforeUpdate] id=${event.params?.where?.id ?? event.params?.where?.documentId ?? 'doc'} payload=${JSON.stringify(
        d,
      )}`,
    );
  },

  // --- nové: po update pošli e-maily ak sa zmenil deliveryStatus ---
  async afterUpdate(event) {
    try {
      const prev: OrderEntity | null = (event.state as any)?.prevOrder || null;
      const next: OrderEntity = event.result as any;

      const prevStatus = prev?.deliveryStatus ?? null;
      const nextStatus = next?.deliveryStatus ?? null;

      if (nextStatus && prevStatus !== nextStatus) {
        const subject = `Zmena stavu doručenia: ${statusLabel(nextStatus)} (objednávka #${next.id})`;
        const tasks: Promise<any>[] = [];

        if (next.customerEmail) {
          tasks.push(
            sendEmail({
              to: next.customerEmail,
              subject,
              html: renderCustomerHtml(next, prevStatus, nextStatus),
            }),
          );
        }

        if (ADMIN_EMAIL) {
          tasks.push(
            sendEmail({
              to: ADMIN_EMAIL,
              subject: `[ADMIN] ${subject}`,
              html: renderAdminHtml(next, prevStatus, nextStatus),
            }),
          );
        }

        await Promise.all(tasks);
        strapi.log.info(
          `[ORDER][afterUpdate] deliveryStatus changed ${prevStatus} -> ${nextStatus}, emails sent (orderId=${next.id})`,
        );
      }
    } catch (e) {
      strapi.log.error('[ORDER][afterUpdate] notify error', e);
    }
  },
};
