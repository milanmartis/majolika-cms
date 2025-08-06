import { factories } from '@strapi/strapi';
import { sendEmail } from '../../../utils/email';

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async create(ctx) {
    // Vytvor objednávku cez core controller
    const response = await super.create(ctx);

    // Pošli potvrdenie emailom
    const { customerEmail, customerName } = response.data.attributes;
    await sendEmail({
      to: customerEmail || 'milanmartis@gmail.com',
      subject: 'Potvrdenie objednávky',
      html: `<p>Vaša objednávka bola prijatá.</p>`,
    });

    // Zisti temporaryId z FE, ak prišiel v payload-e
    const { temporaryId } = ctx.request.body.data || {};
    const items = response.data.attributes.items || [];
    const orderId = response.data.id;

    // 1. SPOJ BOOKINGY CEZ temporaryId
    if (temporaryId) {
      // Všetky pending bookingy pre tento temporaryId (a tento email) priraď k orderId
      await strapi.db.query('api::event-booking.event-booking').updateMany({
        where: {
          temporaryId,
          customerEmail,
          orderId: null, // len tie, ktoré ešte nie sú spárované s objednávkou
        },
        data: { orderId: String(orderId) }
      });
      strapi.log.info(`✅ Bookingy s temporaryId=${temporaryId} spárované s orderId=${orderId}`);
    }

    // 2. PRE ISTOTU fallback: Páruj ešte raz podľa sessionId + email (ak temporaryId nebol/nie je použitý)
    for (const item of items) {
      if (item.type === 'event-session' && item.sessionId) {
        // Skús nájsť existujúci booking bez orderId pre session+email
        const existingBooking = await strapi.db.query('api::event-booking.event-booking').findOne({
          where: {
            session: Number(item.sessionId),
            customerEmail,
            status: 'pending',
            orderId: null,
          }
        });

        if (existingBooking) {
          // Update existujúci booking: priraď k objednávke, updatni peopleCount/meno
          await strapi.db.query('api::event-booking.event-booking').update({
            where: { id: existingBooking.id },
            data: {
              orderId: String(orderId),
              peopleCount: item.peopleCount || 1,
              customerName,
              status: 'pending', // stále pending (Stripe webhook to prepíše)
            },
          });
          strapi.log.info(`✅ Fallback: Booking #${existingBooking.id} priradený k orderId=${orderId}`);
        } else {
          // Ak nenájdem booking, vytvor nový (to sa stane napr. ak temporaryId vôbec nebol použitý)
          await strapi.entityService.create('api::event-booking.event-booking', {
            data: {
              peopleCount: item.peopleCount || 1,
              status: 'pending',
              customerName,
              customerEmail,
              orderId: String(orderId),
              session: Number(item.sessionId),
            }
          });
          strapi.log.info(`✅ Nový booking vytvorený pre orderId=${orderId}, sessionId=${item.sessionId}`);
        }
      }
    }

    return response;
  },
}));
