import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::product.product');


// export default {
//     routes: [
//       {
//         method: 'GET',
//         path: '/products/:id/event-sessions',
//         handler: 'product.eventSessions',
//         config: {
//           // nastav podľa potreby (public / auth / roles)
//           auth: false,
//           policies: [],
//         },
//       },
//       {
//         method: 'POST',
//         path: '/products/:id/event-sessions/:sessionId/book',
//         handler: 'product.bookEventSession',
//         config: {
//           auth: false,
//           policies: [],
//         },
//       },
//       {
//         method: 'POST',
//         path: '/products/:id/event-sessions/:sessionId/confirm-paid',
//         handler: 'product.confirmPaidBooking',
//         config: {
//           auth: false,
//           policies: [],
//         },
//       },
//       {
//         method: 'POST',
//         path: '/products/:id/event-sessions/:sessionId/cancel/:bookingId',
//         handler: 'product.cancelBooking',
//         config: {
//           auth: false,
//           policies: [],
//         },
//       },
//     ],
//   } as const;