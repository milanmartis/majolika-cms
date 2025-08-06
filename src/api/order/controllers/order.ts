import { factories } from '@strapi/strapi';
import { sendEmail } from '../../../utils/email';

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async create(ctx) {
    const response = await super.create(ctx);

    // Pošli email zákazníkovi
    const { customerEmail, customerName } = response.data.attributes;
    await sendEmail({
      to: customerEmail || 'milanmartis@gmail.com',
      subject: 'Potvrdenie objednávky',
      html: `<p>Vaša objednávka bola prijatá.</p>`,
    });

    // TemporaryId môžeš posielať z FE v payload-e
    const { temporaryId } = ctx.request.body.data || {};
    const items = response.data.attributes.items || [];
    const orderId = response.data.id;

    // 1. DOPLŇ – PÁRUJ BOOKING PODĽA temporaryId AK EXISTUJE
    if (temporaryId) {
      // Všetky pending bookingy pre temporaryId priraď k tejto objednávke
      await strapi.db.query('api::event-booking.event-booking').updateMany({
        where: {
          temporaryId,
          customerEmail,
          orderId: null
        },
        data: { orderId: String(orderId) }
      });
    }

    // 2. ŠTANDARDNÉ SPRÁVANIE: SKÚS NAJSKÔR SPÁROVAŤ PODĽA sessionId + email
    for (const item of items) {
      if (item.type === 'event-session' && item.sessionId) {
        // Najdi pending booking bez orderId alebo s orderId=null pre session a email
        const existingBooking = await strapi.db.query('api::event-booking.event-booking').findOne({
          where: {
            session: Number(item.sessionId),
            customerEmail,
            status: 'pending',
            orderId: null,
          }
        });

        if (existingBooking) {
          // Update booking: nastav orderId, peopleCount aj meno
          await strapi.db.query('api::event-booking.event-booking').update({
            where: { id: existingBooking.id },
            data: {
              orderId: String(orderId),
              peopleCount: item.peopleCount || 1,
              customerName,
              status: 'pending', // stále pending, platbu rieši Stripe webhook
            },
          });
        } else {
          // Vytvor nový booking (fallback)
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
        }
      }
    }

    return response;
  },
}));
