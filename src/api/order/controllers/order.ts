// import { factories } from '@strapi/strapi';
// import { sendEmail } from '../../../utils/email';

// export default factories.createCoreController('api::order.order', ({ strapi }) => ({
//   async create(ctx) {
//     const response = await super.create(ctx);

//     // napr. po vytvorení objednávky pošli email
//     await sendEmail({
//       to: 'customer@example.com',
//       subject: 'Potvrdenie objednávky',
//       html: `<p>Vaša objednávka bola prijatá.</p>`,
//     });

//     return response;
//   },
// }));
