// src/api/order/controllers/order.ts
'use strict';

import { factories } from '@strapi/strapi';
import { sendEmail } from '../../../utils/email';

type DeliveryMethod = 'pickup' | 'post_office' | 'packeta_box' | 'post_courier' | 'digital_product';

type GiftWrapMode = 'all' | 'selected' | 'none';
type GiftWrapItem = { productId?: number; quantity?: number; orderItemProductId?: number; };
type GiftWrap = {
  enabled?: boolean;
  mode?: GiftWrapMode;
  note?: string | null;     // poznámka k baleniu
  message?: string | null;  // text na kartičku
  items?: GiftWrapItem[] | null;
};

type OrderWithPacketa = {
  id: number;
  documentId?: string;
  deliveryMethod?: DeliveryMethod;
  deliveryDetails?: { packetaBoxId?: string | null } | null;
};

type OrderWithShipping = {
  id: number;
  documentId?: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
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

  // nové Packeta polia
  parcelWeightKg?: number | null;
  packetaShipmentId?: string | null;
  packetaTrackingNumber?: string | null;
  packetaLabelUrl?: string | null;
  packetaStatus?: string | null;

  // giftWrap JSON
  giftWrap?: GiftWrap | null;

  // (voliteľné) locale na objednávke
  orderLocale?: string | null;
};

/* ========================= i18n ========================= */

type AppLocale = 'sk' | 'en' | 'de';

function normalizeLocale(raw?: any): AppLocale {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return 'sk';
  if (v.startsWith('en')) return 'en';
  if (v.startsWith('de')) return 'de';
  if (v.startsWith('sk') || v.startsWith('cs')) return 'sk';
  return 'sk';
}

const I18N = {
  sk: {
    subjectOrderCreated: 'Potvrdenie objednávky',
    orderReceived: 'Vaša objednávka bola prijatá.',

    postOfficePickupTitle: 'Vyzdvihnutie na pošte',
    branchId: 'ID pobočky',
    address: 'Adresa',

    giftWrapTitle: 'Darčekové balenie',
    mode: 'Režim',
    cardMessage: 'Text na kartičku',
    wrapNote: 'Poznámka k baleniu',

    // value pre mode — nech je aj v sk ľudskejšie (nechávam jednoduché)
    gw_mode_all: 'všetko',
    gw_mode_selected: 'vybrané',
    gw_mode_none: 'žiadne',
  },
  en: {
    subjectOrderCreated: 'Order confirmation',
    orderReceived: 'We have received your order.',

    postOfficePickupTitle: 'Pickup at post office',
    branchId: 'Branch ID',
    address: 'Address',

    giftWrapTitle: 'Gift wrapping',
    mode: 'Mode',
    cardMessage: 'Card message',
    wrapNote: 'Wrapping note',

    gw_mode_all: 'all',
    gw_mode_selected: 'selected',
    gw_mode_none: 'none',
  },
  de: {
    subjectOrderCreated: 'Bestellbestätigung',
    orderReceived: 'Ihre Bestellung wurde angenommen.',

    postOfficePickupTitle: 'Abholung in der Postfiliale',
    branchId: 'Filial-ID',
    address: 'Adresse',

    giftWrapTitle: 'Geschenkverpackung',
    mode: 'Modus',
    cardMessage: 'Kartentext',
    wrapNote: 'Hinweis zur Verpackung',

    gw_mode_all: 'alles',
    gw_mode_selected: 'ausgewählt',
    gw_mode_none: 'keine',
  },
} as const;

function t(locale: AppLocale) {
  return I18N[locale] || I18N.sk;
}

function humanGiftWrapMode(mode?: GiftWrapMode | null, locale: AppLocale = 'sk'): string {
  const TT = t(locale);
  if (mode === 'selected') return TT.gw_mode_selected;
  if (mode === 'none') return TT.gw_mode_none;
  return TT.gw_mode_all;
}

/* ========================= helpers ========================= */

function esc(s?: string) {
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function absUrl(url?: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const serverUrl = (strapi.config?.get?.('server.url') as string) || '';
  const base =
    process.env.PUBLIC_UPLOADS_URL ||
    process.env.UPLOADS_BASE_URL ||
    serverUrl ||
    process.env.FRONTEND_URL ||
    '';
  if (!base) return '';
  const root = String(base).replace(/\/$/, '');
  const rel = url.startsWith('/') ? url : `/${url}`;
  return `${root}${rel}`;
}

function pickProductImage(product: any): string {
  const single = product?.picture_new;
  const firstMulti = Array.isArray(product?.pictures_new) ? product.pictures_new[0] : null;
  const media = single || firstMulti || null;
  const url =
    media?.formats?.thumbnail?.url ||
    media?.formats?.small?.url ||
    media?.formats?.medium?.url ||
    media?.formats?.large?.url ||
    media?.url;
  return absUrl(url);
}

function normalizeGiftWrap(raw: any): GiftWrap | null {
  if (!raw) return null;

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      // string -> ber ako note
      return { enabled: true, mode: 'all', note: raw, message: null, items: null };
    }
  }

  if (typeof raw !== 'object') return null;

  const enabled = !!raw.enabled;
  if (!enabled) return null;

  const mode: GiftWrapMode =
    raw.mode === 'selected' ? 'selected' :
    raw.mode === 'none' ? 'none' :
    'all';

  const note = typeof raw.note === 'string' ? raw.note.trim() : null;
  const message = typeof raw.message === 'string' ? raw.message.trim() : null;

  let items: GiftWrapItem[] | null = null;
  if (mode === 'selected' && Array.isArray(raw.items)) {
    items = raw.items
      .map((x: any) => ({
        productId: Number(x?.productId) || undefined,
        quantity: Number(x?.quantity) || undefined,
        orderItemProductId: Number(x?.orderItemProductId) || undefined,
      }))
      .filter((x: any) => x.productId || x.orderItemProductId);

    if (!items.length) items = null;
  }

  return { enabled, mode, note, message, items };
}

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async ping(ctx) { ctx.send({ ok: true }); },

  async create(ctx) {
    const body = ctx.request.body || {};
    const data = body.data || {};

    // ✅ locale z FE (preferované), fallback z data.locale, neskôr fallback z order.locale
    const localeFromPayload: AppLocale = normalizeLocale(data?.orderLocale ?? data?.locale);
    data.orderLocale = localeFromPayload;

    // --- Bezpečná extrakcia FE payloadu ---
    const delivery = data.delivery || {};
    const method: DeliveryMethod = delivery.method || data.deliveryMethod || 'pickup';
    const details = delivery.details || {};
    const addr = delivery.address || {};

    // --- normalizácia poznámky z FE (notes = poznámka k objednávke)
    if (typeof data.notes === 'string') {
      data.notes = data.notes.trim() || null;
    }

    // --- normalizácia giftWrap z FE
    // očakávam: data.giftWrap (JSON alebo string JSON)
    // uložíme ako JSON, alebo null
    if (data.giftWrap !== undefined) {
      const gw = normalizeGiftWrap(data.giftWrap);
      // JSONValue v Strapi: najistejšie je stringify/parse, aby to bolo čisté JSON
      data.giftWrap = gw ? JSON.parse(JSON.stringify(gw)) : null;
    }

    // --- doplnenie imageUrl do položiek (ak chýba)
    if (Array.isArray(data.items) && data.items.length) {
      data.items = await Promise.all(
        data.items.map(async (it: any) => {
          const out = { ...it };
          if (!out.imageUrl && out.productId) {
            try {
              const product = await strapi.entityService.findOne('api::product.product', Number(out.productId), {
                populate: {
                  picture_new: { fields: ['url', 'formats'] },
                  pictures_new: { fields: ['url', 'formats'] },
                },
              });
              out.imageUrl = pickProductImage(product);
            } catch (e) {
              strapi.log.warn(`[ORDER][CREATE] imageUrl fill failed for product ${out.productId}: ${String(e)}`);
            }
          }
          // ešte pre istotu urob absolútnu URL, ak prišlo z FE relatívne:
          if (out.imageUrl) out.imageUrl = absUrl(out.imageUrl);
          return out;
        })
      );
    }

    // --- Normalizácia a validácia podľa metódy doručenia ---
    if (method === 'post_office') {
      if (!details.postOfficeId) {
        return ctx.badRequest('postOfficeId required for post_office delivery');
      }
      data.deliveryMethod = 'post_office';
      data.deliveryDetails = {
        provider: details.provider || 'slposta',
        postOfficeId: String(details.postOfficeId),
        packetaBoxId: null,
        notes: details.notes ?? null,
      };
      data.deliveryAddress = {
        street: addr.street ?? null,
        city: addr.city ?? null,
        zip: addr.zip ?? null,
        country: addr.country ?? 'SK',
      };
    }

    if (method === 'packeta_box') {
      if (!details.packetaBoxId) {
        return ctx.badRequest('packetaBoxId required for packeta_box delivery');
      }
      data.deliveryMethod = 'packeta_box';
      data.deliveryDetails = {
        provider: details.provider || 'packeta',
        packetaBoxId: String(details.packetaBoxId),
        postOfficeId: null,
        notes: details.notes ?? null,
      };
      // deliveryAddress pre výdajné miesto nie je nutná
      data.deliveryAddress = data.deliveryAddress ?? null;
    }

    if (method === 'post_courier') {
      data.deliveryMethod = 'post_courier';
      data.deliveryDetails = {
        provider: details.provider ?? null,
        postOfficeId: null,
        packetaBoxId: null,
        notes: details.notes ?? null,
      };
      // kuriér potrebuje adresu
      data.deliveryAddress = {
        street: addr.street ?? null,
        city: addr.city ?? null,
        zip: addr.zip ?? null,
        country: addr.country ?? 'SK',
      };
    }

    if (method === 'pickup') {
      data.deliveryMethod = 'pickup';
      data.deliveryDetails = {
        provider: null,
        postOfficeId: null,
        packetaBoxId: null,
        notes: details.notes ?? null,
      };
      data.deliveryAddress = null;
    }

    if (method === 'digital_product') {
      data.deliveryMethod = 'digital_product';
      data.deliveryDetails = {
        provider: null,
        postOfficeId: null,
        packetaBoxId: null,
        notes: details.notes ?? null,
      };
      data.deliveryAddress = null;
    }

    // --- Vytvor objednávku s už normalizovanými dátami ---
    // IMPORTANT: data as any -> kvôli TS typu Input<order> (kým sa typy nezregenerujú)
    const order = await strapi.entityService.create('api::order.order', {
      data: data as any,
      populate: ['items', 'deliveryAddress', 'deliveryDetails', 'customer'],
    }) as unknown as OrderWithShipping;

    // ✅ locale finálne: payload.locale -> order.locale -> sk
    const orderLocale: AppLocale = normalizeLocale((order as any)?.orderLocale ?? localeFromPayload);
    const TT = t(orderLocale);

    // --- Post-create logika (email, párovanie bookingov) ---
    const customerEmail: string | undefined = (order as any).customerEmail;
    const customerName: string | undefined = (order as any).customerName;
    const customerPhone: string | undefined = (order as any).customerPhone;
    const temporaryId: string | null = body.data?.temporaryId || null;
    const items: any[] = (order as any).items || [];
    const orderId = order.id;

    // 1) Potvrdenie emailom (toto je len "order created" — pri karte ti aj tak príde "paid" mail z payment controller)
    // (nechávam minimálny mail, ale dopĺňam info o giftWrap, nech to máš aj tu keď sa používa)
    try {
      const det = (order as any).deliveryDetails || {};
      const dAddr = (order as any).deliveryAddress || {};
      const isPostOffice = (order as any).deliveryMethod === 'post_office';

      const addressLine = [dAddr.street, dAddr.city, dAddr.zip, dAddr.country].filter(Boolean).join(', ');
      const deliverySection = isPostOffice
        ? `
          <hr>
          <p><strong>${esc(TT.postOfficePickupTitle)}</strong><br>
          ${esc(TT.branchId)}: ${esc(det.postOfficeId ?? '')}<br>
          ${esc(TT.address)}: ${esc(addressLine || '-')}
          </p>`
        : '';

      const gw = normalizeGiftWrap((order as any).giftWrap);
      const giftWrapSection = gw
        ? `
          <hr>
          <p><strong>${esc(TT.giftWrapTitle)}:</strong><br>
          ${esc(TT.mode)}: ${esc(humanGiftWrapMode(gw.mode, orderLocale))}<br>
          ${gw.message ? `${esc(TT.cardMessage)}: ${esc(gw.message)}<br>` : ''}
          ${gw.note ? `${esc(TT.wrapNote)}: ${esc(gw.note)}<br>` : ''}
          </p>
        `
        : '';

      await sendEmail({
        to: customerEmail || 'milanmartis@gmail.com',
        subject: TT.subjectOrderCreated,
        html: `
          <p>${esc(TT.orderReceived)}</p>
          ${deliverySection}
          ${giftWrapSection}
        `,
      });

      strapi.log.info(`[ORDER] Potvrdenie objednávky odoslané na ${customerEmail} (locale=${orderLocale})`);
    } catch (e) {
      strapi.log.error(`[ORDER] Nepodarilo sa odoslať email na ${customerEmail}:`, e);
    }

    // 2) Logy
    strapi.log.info(`[ORDER] incoming FE payload temporaryId: ${temporaryId}`);
    strapi.log.info(`[ORDER] incoming FE payload customerEmail: ${customerEmail}`);
    strapi.log.info(`[ORDER] giftWrap: ${(order as any).giftWrap ? 'YES' : 'NO'}`);
    strapi.log.info(`[ORDER] locale: ${orderLocale}`);

    // 3) Spárovanie bookingov podľa temporaryId + email
    if (temporaryId && customerEmail) {
      try {
        const pendingBookings = await strapi.db
          .query('api::event-booking.event-booking')
          .findMany({
            where: {
              temporaryId,
              customerEmail,
              customerPhone,
              orderId: null,
            },
          });

        strapi.log.info(
          `[ORDER] Počet pending bookingov na spárovanie (temporaryId=${temporaryId}): ${pendingBookings.length}`,
        );

        if (pendingBookings.length > 0) {
          await strapi.db
            .query('api::event-booking.event-booking')
            .updateMany({
              where: { temporaryId, customerEmail, orderId: null },
              data: { orderId: String(orderId) },
            });

          strapi.log.info(`✅ Bookingy s temporaryId=${temporaryId} spárované s orderId=${orderId}`);
        } else {
          strapi.log.warn(
            `[ORDER] Žiadne pending bookingy na spárovaní s temporaryId=${temporaryId} a email=${customerEmail}!`,
          );
        }
      } catch (e) {
        strapi.log.error(`[ORDER] Chyba pri spárovaní bookingov cez temporaryId:`, e);
      }
    } else {
      strapi.log.warn(`[ORDER] temporaryId alebo customerEmail nebol zadaný, skipping booking update.`);
    }

    // 4) Fallback spárovanie podľa sessionId + email
    for (const item of items) {
      if (item.type === 'event-session' && item.sessionId) {
        try {
          strapi.log.info(
            `[ORDER] Fallback: hľadám booking pre sessionId=${item.sessionId}, email=${customerEmail}`,
          );

          const existingBooking = await strapi.db
            .query('api::event-booking.event-booking')
            .findOne({
              where: {
                session: Number(item.sessionId),
                customerEmail,
                status: 'confirmed',
                orderId: null,
              },
            });

          if (existingBooking) {
            await strapi.db
              .query('api::event-booking.event-booking')
              .update({
                where: { id: existingBooking.id },
                data: {
                  orderId: String(orderId),
                  peopleCount: item.peopleCount || 1,
                  customerName,
                  customerPhone,
                  status: 'confirmed',
                },
              });

            strapi.log.info(
              `✅ Fallback: Booking #${existingBooking.id} priradený k orderId=${orderId}`,
            );
          } else {
            const createdBooking = await strapi.entityService.create(
              'api::event-booking.event-booking',
              {
                data: {
                  peopleCount: item.peopleCount || 1,
                  status: 'confirmed',
                  customerName,
                  customerEmail,
                  customerPhone,
                  orderId: String(orderId),
                  session: Number(item.sessionId),
                } as any,
              },
            );

            strapi.log.info(
              `✅ Nový booking vytvorený pre orderId=${orderId}, sessionId=${item.sessionId}, bookingId=${(createdBooking as any).id}`,
            );
          }
        } catch (e) {
          strapi.log.error(
            `[ORDER] Fallback booking handling error (sessionId=${item.sessionId}, email=${customerEmail}):`,
            e,
          );
        }
      }
    }

    // 5) Response v tvare podobnom super.create
    ctx.body = { data: { id: order.id, attributes: order } };
  },

  async shipPacketa(ctx) {
    const id = Number(ctx.params.id);
    const { weightKg, codEur } = ctx.request.body || {};
  
    if (!Number.isFinite(id)) return ctx.badRequest('Invalid order id');
  
    const w = Number(weightKg);
    if (!Number.isFinite(w) || w <= 0) return ctx.badRequest('weightKg is required');
  
    const cod = Number(codEur ?? 0);
    if (!Number.isFinite(cod) || cod < 0) return ctx.badRequest('codEur must be a number >= 0');
  
    const order = (await strapi.documents('api::order.order').findFirst({
      filters: { id },
      populate: ['deliveryDetails', 'deliveryAddress'],
    })) as any; // tu si už aj tak castuješ, Strapi typy nie sú presné
  
    if (!order) return ctx.notFound('Order not found');
    if (order.deliveryMethod !== 'packeta_box') return ctx.badRequest('Order is not Packeta delivery');
    if (!order.deliveryDetails?.packetaBoxId) return ctx.badRequest('Missing Packeta pickup point');
    if (!order.documentId) return ctx.throw(500, 'Order has no documentId (unexpected in Strapi v5)');
  
    // ✅ telefón berieme z customerPhone (tak ako ho reálne ukladáš)
    const phoneCandidate = order.customerPhone || order.deliveryDetails?.phone;
    if (!phoneCandidate) return ctx.badRequest('Missing phone');
  
    try {
      const shipping = await strapi
        .service('api::packeta.packeta')
        .createShipmentFromOrder(order, {
          weightKg: w,
          codEur: cod,
          currency: 'EUR',
        });
  
        const updateData = {
          parcelWeightKg: w,
          packetaShipmentId: shipping?.shipmentId ?? null,
          packetaTrackingNumber: shipping?.trackingNumber ?? null,
          packetaLabelUrl: shipping?.labelUrl ?? null,
        
          packetaStatus: 'created' as const,
          deliveryStatus: 'label_created' as const,
          fulfillmentStatus: 'processing' as const,
        };
        
        await strapi.documents('api::order.order').update({
          documentId: order.documentId,
          data: updateData,
        });
  
      ctx.body = {
        ok: true,
        shipmentId: shipping?.shipmentId ?? null,
        trackingNumber: shipping?.trackingNumber ?? null,
        labelUrl: shipping?.labelUrl ?? null,
      };
    } catch (e: any) {
      strapi.log.error('[PACKETA][SHIP] error', e?.message || e);
      return ctx.throw(502, 'Packeta ship failed');
    }
  },
  

  // GET /orders/my
  async my(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();

    const userEmail = user.email;

    const orders = await strapi.entityService.findMany('api::order.order', {
      filters: { customer: { email: userEmail } },
      sort: 'createdAt:desc',
      populate: ['items', 'items.product', 'deliveryAddress', 'deliveryDetails'],
    });

    const totalSpent = (orders as any[]).reduce(
      (sum, o) => sum + Number((o as any).total || 0),
      0,
    );

    return {
      orders: (orders as any[]).map((order: any) => ({
        id: order.id,
        createdAt: order.createdAt,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        total: order.total,
        fulfillmentStatus: order.fulfillmentStatus,
        deliveryStatus: order.deliveryStatus,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        paymentMethod: order.paymentMethod,
        totalWithShipping: order.totalWithShipping,
        items: order.items,
        deliveryMethod: order.deliveryMethod,
        deliveryAddress: order.deliveryAddress,
        deliveryDetails: order.deliveryDetails,
        shippingFee: order.shippingFee,
        paymentFee: order.paymentFee,

        // 👇 vráť aj giftWrap, nech to vie FE/účty ukázať
        giftWrap: order.giftWrap ?? null,
      })),
      totalSpent,
    };
  },

}));