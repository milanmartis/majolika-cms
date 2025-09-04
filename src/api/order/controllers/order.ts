// src/api/order/controllers/order.ts
import { factories } from '@strapi/strapi';
import { sendEmail } from '../../../utils/email';
type OrderWithPacketa = {
  deliveryMethod?: 'pickup' | 'post_office' | 'packeta_box' | 'post_courier';
  deliveryDetails?: { packetaBoxId?: string | null } | null;
};

type DeliveryMethod = 'pickup' | 'post_office' | 'packeta_box' | 'post_courier';
type OrderWithShipping = {
  id: number;
  customerName?: string | null;
  customerEmail?: string | null;
  deliveryMethod: 'pickup' | 'post_office' | 'packeta_box' | 'post_courier';
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
};
export default factories.createCoreController('api::order.order', ({ strapi }) => ({

  async create(ctx) {
    const body = ctx.request.body || {};
    const data = body.data || {};

    // --- Bezpečná extrakcia FE payloadu ---
    const delivery = data.delivery || {};
    const method: DeliveryMethod = delivery.method || data.deliveryMethod || 'pickup';
    const details = delivery.details || {};
    const addr = delivery.address || {};

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

    // --- Vytvor objednávku s už normalizovanými dátami ---
    // Pozn.: populate doplň podľa potreby
    const order = await strapi.entityService.create('api::order.order', {
      data,
      populate: ['items', 'deliveryAddress', 'deliveryDetails', 'customer'],
    }) as unknown as OrderWithShipping;

    // --- Post-create logika (email, párovanie bookingov) ---
    const customerEmail: string | undefined = (order as any).customerEmail;
    const customerName: string | undefined = (order as any).customerName;
    const temporaryId: string | null = body.data?.temporaryId || null;
    const items: any[] = (order as any).items || [];
    const orderId = order.id;

    // 1) Potvrdenie emailom
    try {
      const det = (order as any).deliveryDetails || {};
      const addr = (order as any).deliveryAddress || {};
      const isPostOffice = (order as any).deliveryMethod === 'post_office';
    
      const addressLine = [addr.street, addr.city, addr.zip, addr.country].filter(Boolean).join(', ');
      const deliverySection = isPostOffice
        ? `
          <hr>
          <p><strong>Vyzdvihnutie na pošte</strong><br>
          ID pobočky: ${det.postOfficeId ?? ''}<br>
          Adresa: ${addressLine || '-'}
          </p>`
        : '';
    
      await sendEmail({
        to: customerEmail || 'milanmartis@gmail.com',
        subject: 'Potvrdenie objednávky',
        html: `
          <p>Vaša objednávka bola prijatá.</p>
          ${deliverySection}
        `,
      });
    
      strapi.log.info(`[ORDER] Potvrdenie objednávky odoslané na ${customerEmail}`);
    } catch (e) {
      strapi.log.error(`[ORDER] Nepodarilo sa odoslať email na ${customerEmail}:`, e);
    }

    // 2) Logy
    strapi.log.info(`[ORDER] incoming FE payload temporaryId: ${temporaryId}`);
    strapi.log.info(`[ORDER] incoming FE payload customerEmail: ${customerEmail}`);

    // 3) Spárovanie bookingov podľa temporaryId + email
    if (temporaryId && customerEmail) {
      try {
        const pendingBookings = await strapi.db
          .query('api::event-booking.event-booking')
          .findMany({
            where: {
              temporaryId,
              customerEmail,
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
            `[ORDER] Žiadne pending bookingy na spárovanie s temporaryId=${temporaryId} a email=${customerEmail}!`,
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
                status: 'pending',
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
                  status: 'pending',
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
                  status: 'pending',
                  customerName,
                  customerEmail,
                  orderId: String(orderId),
                  session: Number(item.sessionId),
                },
              },
            );

            strapi.log.info(
              `✅ Nový booking vytvorený pre orderId=${orderId}, sessionId=${item.sessionId}, bookingId=${createdBooking.id}`,
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
    const { weightKg } = ctx.request.body || {};
  
    if (!id) return ctx.badRequest('Missing order id');
    if (!weightKg || Number(weightKg) <= 0) return ctx.badRequest('weightKg is required');
  
    // 👇 potlačíme TS: lokálny typ s políčkami, ktoré potrebujeme
    const order = await strapi.entityService.findOne('api::order.order', id, {
      populate: ['deliveryDetails', 'deliveryAddress'],
    }) as unknown as OrderWithPacketa;
  
    if (!order) return ctx.notFound('Order not found');
    if (order.deliveryMethod !== 'packeta_box') {
      return ctx.badRequest('Order is not Packeta delivery');
    }
    if (!order.deliveryDetails?.packetaBoxId) {
      return ctx.badRequest('Missing Packeta pickup point');
    }
  
    try {
      const shipping = await strapi
        .service('api::shipping.shipping')
        .createShipmentFromOrder(order as any, { weightKg: Number(weightKg) });
  
      await strapi.entityService.update('api::order.order', id, {
        data: {
          parcelWeightKg: Number(weightKg),
          packetaShipmentId: shipping.shipmentId ?? null,
          packetaTrackingNumber: shipping.trackingNumber ?? null,
          packetaLabelUrl: shipping.labelUrl ?? null,
          packetaStatus: 'created',
        } as any, // 👈 tu potlačíme TS, kým sa negenerujú nové typy
      });
  
      // ✅ nepoužívame `updated.*` (to spôsobovalo TS chyby)
      ctx.body = {
        ok: true,
        shipmentId: shipping.shipmentId ?? null,
        trackingNumber: shipping.trackingNumber ?? null,
        labelUrl: shipping.labelUrl ?? null,
      };
    } catch (e) {
      strapi.log.error('[PACKETA][SHIP] error', e);
      return ctx.internalServerError('Packeta ship failed');
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
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        items: order.items,
        deliveryMethod: order.deliveryMethod,
        deliveryAddress: order.deliveryAddress,
        deliveryDetails: order.deliveryDetails,
      })),
      totalSpent,
    };
  },

}));
