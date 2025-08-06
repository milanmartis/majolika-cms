import { factories } from '@strapi/strapi';
import { sendEmail } from '../../../utils/email';

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async create(ctx) {
    const response = await super.create(ctx);

    // Posli email zákazníkovi
    const { customerEmail, customerName } = response.data.attributes;
    await sendEmail({
      to: customerEmail || 'milanmartis@gmail.com',
      subject: 'Potvrdenie objednávky',
      html: `<p>Vaša objednávka bola prijatá.</p>`,
    });

    // Vytvor alebo priraď booking/y pre každú položku objednávky, ktorá je typu rezervácia
    const items = response.data.attributes.items || [];
    const orderId = response.data.id;

    for (const item of items) {
      if (item.type === 'event-session' && item.sessionId) {
        // Skús najprv nájsť už existujúci booking podľa sessionId + customerEmail a status=pending
        const existingBooking = await strapi.db.query('api::event-booking.event-booking').findOne({
          where: {
            session: item.sessionId,
            customerEmail,
            status: 'pending'
          }
        });

        if (existingBooking) {
          // Update booking: nastav orderId a peopleCount ak sa líši
          await strapi.db.query('api::event-booking.event-booking').update({
            where: { id: existingBooking.id },
            data: {
              orderId: String(orderId),
              peopleCount: item.peopleCount || 1,
              customerName,
              status: 'pending', // stále pending
            },
          });
        } else {
          // Vytvor nový booking
          await strapi.entityService.create('api::event-booking.event-booking', {
            data: {
              peopleCount: item.peopleCount || 1,
              status: 'pending',
              customerName,
              customerEmail,
              orderId: String(orderId),
              session: item.sessionId,
            }
          });
        }
      }
    }

    return response;
  },
}));
