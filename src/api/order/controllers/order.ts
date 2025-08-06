import { factories } from '@strapi/strapi';
import { sendEmail } from '../../../utils/email';

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async create(ctx) {
    console.log('🟢🟢🟢🟢🟢🟢  [ORDER CONTROLLER]   ----  CREATE ORDER CALLED ----');

    // 1. Vytvor objednávku cez core controller
    const response = await super.create(ctx);

    // 2. Pošli potvrdenie emailom (voliteľné)
    const { customerEmail, customerName } = response.data.attributes;
    await sendEmail({
      to: customerEmail || 'milanmartis@gmail.com',
      subject: 'Potvrdenie objednávky',
      html: `<p>Vaša objednávka bola prijatá.</p>`,
    });

    // 3. Získaj temporaryId z FE (request)
    const { temporaryId } = ctx.request.body.data || {};
    const orderId = response.data.id;

    strapi.log.info(`[ORDER] Created order with id: ${orderId} and temporaryId: ${temporaryId}`);

    // 4. Update bookingy podľa temporaryId a status 'pending'
    if (temporaryId) {
      const updateResult = await strapi.db.query('api::event-booking.event-booking').updateMany({
        where: {
          temporaryId,
          status: 'pending',
        },
        data: {
          orderId: String(orderId),
          status: 'paid',
        },
      });
      strapi.log.info(`[ORDER] Updated ${updateResult.count} booking(s) to paid for temporaryId=${temporaryId}, orderId=${orderId}`);
    } else {
      strapi.log.warn(`[ORDER] No temporaryId provided in request. No bookings updated.`);
    }

    return response;
  },
}));
