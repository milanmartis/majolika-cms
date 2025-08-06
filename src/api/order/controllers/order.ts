import { factories } from '@strapi/strapi';
import { sendEmail } from '../../../utils/email';

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async create(ctx) {
    strapi.log.info('🟩 [ORDER] CREATE ORDER CALLED!');
    try {
      strapi.log.info('BODY:', JSON.stringify(ctx.request.body));
      const response = await super.create(ctx);
      strapi.log.info('RESPONSE:', JSON.stringify(response));

      // fallback ak by response.data chýbalo
      const attrs = response?.data?.attributes || {};
      const { customerEmail } = attrs;

      // fallback na sendEmail – ak neexistuje, komentuj!
      if (customerEmail) {
        await sendEmail({
          to: customerEmail,
          subject: 'Test',
          html: `<p>Test order</p>`
        });
      }

      return response;
    } catch (err) {
      strapi.log.error('CREATE ORDER ERROR:', err);
      throw err;
    }
  }
}));