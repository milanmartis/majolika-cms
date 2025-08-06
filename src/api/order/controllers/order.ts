import { factories } from '@strapi/strapi';
import { sendEmail } from '../../../utils/email';

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async create(ctx) {
    // 1. Vytvor objednávku cez core controller
    const response = await super.create(ctx);

    // 2. Pošli potvrdenie emailom
    const { customerEmail, customerName } = response.data.attributes;
    await sendEmail({
      to: customerEmail || 'milanmartis@gmail.com',
      subject: 'Potvrdenie objednávky',
      html: `<p>Vaša objednávka bola prijatá.</p>`,
    });

    // 3. Priprav dáta z FE
    const { temporaryId } = ctx.request.body.data || {};
    const items = response.data.attributes.items || [];
    const orderId = response.data.id;

    strapi.log.info('===> [ORDER] incoming FE payload temporaryId:', temporaryId);
    strapi.log.info('===> [ORDER] incoming FE payload customerEmail:', customerEmail);

    // --- Hlavný update podľa orderId ---
    let updatedCount = 0;
    if (orderId) {
      const updateResult = await strapi.db.query('api::event-booking.event-booking').updateMany({
        where: {
          orderId: String(orderId),
          status: 'pending',
        },
        data: { status: 'paid' },
      });
      updatedCount = updateResult.count;
      strapi.log.info(`===> [ORDER] Updated ${updatedCount} booking(s) to 'paid' for orderId=${orderId}`);
    }

    // --- Fallback podľa temporaryId + customerEmail, ak nič nebolo updatnuté ---
    if (updatedCount === 0 && temporaryId && customerEmail) {
      const fallbackResult = await strapi.db.query('api::event-booking.event-booking').updateMany({
        where: {
          temporaryId,
          customerEmail,
          status: 'pending',
        },
        data: {
          status: 'paid',
          orderId: String(orderId)
        },
      });
      const fallbackCount = fallbackResult.count;
      strapi.log.info(`===> [ORDER] Fallback: Updated ${fallbackCount} booking(s) to 'paid' and set orderId=${orderId} (temporaryId+email)`);
    }

    // --- (voliteľne) fallback podľa sessionId + email ---
    for (const item of items) {
      if (item.type === 'event-session' && item.sessionId) {
        strapi.log.info(`===> [ORDER] Fallback hľadám booking pre sessionId=${item.sessionId}, email=${customerEmail}`);
        const existingBooking = await strapi.db.query('api::event-booking.event-booking').findOne({
          where: {
            session: Number(item.sessionId),
            customerEmail,
            status: 'pending',
            orderId: null,
          }
        });

        if (existingBooking) {
          await strapi.db.query('api::event-booking.event-booking').update({
            where: { id: existingBooking.id },
            data: {
              orderId: String(orderId),
              peopleCount: item.peopleCount || 1,
              customerName,
              status: 'paid',
            },
          });
          strapi.log.info(`✅ Fallback: Booking #${existingBooking.id} priradený k orderId=${orderId} a status 'paid'`);
        } else {
          // Ak nenájdem booking, vytvor nový
          const createdBooking = await strapi.entityService.create('api::event-booking.event-booking', {
            data: {
              peopleCount: item.peopleCount || 1,
              status: 'paid',
              customerName,
              customerEmail,
              orderId: String(orderId),
              session: Number(item.sessionId),
            }
          });
          strapi.log.info(`✅ Nový booking vytvorený pre orderId=${orderId}, sessionId=${item.sessionId}, bookingId=${createdBooking.id}, status 'paid'`);
        }
      }
    }

    return response;
  },
}));
