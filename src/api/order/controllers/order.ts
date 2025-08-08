import { factories } from '@strapi/strapi';
import { sendEmail } from '../../../utils/email';

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async create(ctx) {
    // 1. Vytvor objednávku cez core controller
    const response = await super.create(ctx);

    // 2. Získaj základné dáta z response a payloadu
    const { customerEmail, customerName } = response.data.attributes;
    const { temporaryId } = ctx.request.body.data || {};
    const items = response.data.attributes.items || [];
    const orderId = response.data.id;

    // 3. Pošli potvrdenie emailom
    try {
      await sendEmail({
        to: customerEmail || 'milanmartis@gmail.com',
        subject: 'Potvrdenie objednávky',
        html: `<p>Vaša objednávka bola prijatá.</p>`,
      });
      strapi.log.info(`[ORDER] Potvrdenie objednávky odoslané na ${customerEmail}`);
    } catch (e) {
      strapi.log.error(`[ORDER] Nepodarilo sa odoslať email na ${customerEmail}:`, e);
    }

    // 4. Loguj temporaryId a email
    strapi.log.info(`[ORDER] incoming FE payload temporaryId: ${temporaryId}`);
    strapi.log.info(`[ORDER] incoming FE payload customerEmail: ${customerEmail}`);

    // 5. SPOJ BOOKINGY CEZ temporaryId (prvý, preferovaný spôsob)
    if (temporaryId && customerEmail) {
      try {
        const pendingBookings = await strapi.db.query('api::event-booking.event-booking').findMany({
          where: {
            temporaryId,
            customerEmail,
            orderId: null,
          },
        });

        strapi.log.info(`[ORDER] Počet pending bookingov na spárovanie (temporaryId=${temporaryId}): ${pendingBookings.length}`);
        if (pendingBookings.length > 0) {
          await strapi.db.query('api::event-booking.event-booking').updateMany({
            where: {
              temporaryId,
              customerEmail,
              orderId: null,
            },
            data: { orderId: String(orderId) },
          });
          strapi.log.info(`✅ Bookingy s temporaryId=${temporaryId} spárované s orderId=${orderId}`);
        } else {
          strapi.log.warn(`[ORDER] Žiadne pending bookingy na spárovanie s temporaryId=${temporaryId} a email=${customerEmail}!`);
        }
      } catch (e) {
        strapi.log.error(`[ORDER] Chyba pri spárovaní bookingov cez temporaryId:`, e);
      }
    } else {
      strapi.log.warn(`[ORDER] temporaryId alebo customerEmail nebol zadaný, skipping booking update.`);
    }

    // 6. Fallback – párovanie podľa sessionId + email (ak temporaryId nebol/nie je použitý)
    for (const item of items) {
      if (item.type === 'event-session' && item.sessionId) {
        try {
          strapi.log.info(`[ORDER] Fallback: hľadám booking pre sessionId=${item.sessionId}, email=${customerEmail}`);
          const existingBooking = await strapi.db.query('api::event-booking.event-booking').findOne({
            where: {
              session: Number(item.sessionId),
              customerEmail,
              status: 'pending',
              orderId: null,
            },
          });

          if (existingBooking) {
            await strapi.db.query('api::event-booking.event-booking').update({
              where: { id: existingBooking.id },
              data: {
                orderId: String(orderId),
                peopleCount: item.peopleCount || 1,
                customerName,
                status: 'pending',
              },
            });
            strapi.log.info(`✅ Fallback: Booking #${existingBooking.id} priradený k orderId=${orderId}`);
          } else {
            const createdBooking = await strapi.entityService.create('api::event-booking.event-booking', {
              data: {
                peopleCount: item.peopleCount || 1,
                status: 'pending',
                customerName,
                customerEmail,
                orderId: String(orderId),
                session: Number(item.sessionId),
              },
            });
            strapi.log.info(`✅ Nový booking vytvorený pre orderId=${orderId}, sessionId=${item.sessionId}, bookingId=${createdBooking.id}`);
          }
        } catch (e) {
          strapi.log.error(`[ORDER] Fallback booking handling error (sessionId=${item.sessionId}, email=${customerEmail}):`, e);
        }
      }
    }

    // 7. Vráť response
    return response;
  },
  async my(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const userEmail = user.email;
    // nájde objednávky, kde customer.id je rovný id užívateľa
    const orders = await strapi.entityService.findMany('api::order.order', {
      filters: { customer: { email: userEmail } },
      sort: 'createdAt:desc',
      populate: ['items', 'items.product'], // repeatable component
    });
  
    const totalSpent = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  
    return {
      orders: orders.map(order => ({
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        items: (order as any).items  
      })),
      totalSpent
    };
  }
}));
