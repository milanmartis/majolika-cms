// import { factories } from '@strapi/strapi';

// export default factories.createCoreService('api::event-session.event-session', ({ strapi }) => ({
//   async getCapacity(sessionId: number) {
//     const session = await strapi.entityService.findOne('api::event-session.event-session', sessionId, {
//       fields: ['id', 'maxCapacity'],
//       populate: { bookings: { fields: ['peopleCount', 'status'] } },
//     });
//     if (!session) return null;
//     const booked = (session.bookings || [])
//       .filter((b: any) => ['paid', 'confirmed'].includes(b.status))
//       .reduce((sum: number, b: any) => sum + (b.peopleCount || 0), 0);
//     const available = Math.max(0, session.maxCapacity - booked);
//     return { booked, available, max: session.maxCapacity };
//   },
// }));