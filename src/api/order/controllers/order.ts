import { factories } from '@strapi/strapi';
import { sendEmail } from '../../../utils/email';

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async create(ctx) {
    const response = await super.create(ctx);

    // Posli email zákazníkovi
    const { customerEmail } = response.data.attributes;
    await sendEmail({
      to: customerEmail || 'milanmartis@gmail.com',
      subject: 'Potvrdenie objednávky',
      html: `<p>Vaša objednávka bola prijatá.</p>`,
    });

    // Vytvor booking/y pre každú položku objednávky, ktorá je typu rezervácia
    // PREDPOKLADÁME že v položke máš napr. { type: 'event-session', sessionId: 123, peopleCount: 2 }
    const items = response.data.attributes.items || [];

    for (const item of items) {
      if (item.type === 'event-session' && item.sessionId) {
        // Pozor: Prispôsob podľa tvojej štruktúry order.item componentu!
        await strapi.entityService.create('api::event-booking.event-booking', {
          data: {
            peopleCount: item.peopleCount || 1,
            status: 'pending', // alebo paid, podľa logiky
            customerName: response.data.attributes.customerName,
            customerEmail: response.data.attributes.customerEmail,
            orderId: response.data.id, // alebo iné ID
            session: item.sessionId,
          }
        });
      }
    }

    return response;
  },
}));