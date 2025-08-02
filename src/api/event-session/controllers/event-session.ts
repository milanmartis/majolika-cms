import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::event-booking.event-booking', ({ strapi }) => ({
  async create(ctx) {
    const { session: sessionId, peopleCount, customerName, customerEmail, orderId } = ctx.request.body;

    if (!sessionId || !peopleCount) {
      return ctx.badRequest('Missing required fields: session and peopleCount');
    }

    const sessionService = strapi.service('api::event-session.event-session');
    const result = await sessionService.createBookingIfAvailable(Number(sessionId), {
      peopleCount: Number(peopleCount),
      status: 'pending',
      customerName,
      customerEmail,
      orderId,
      session: Number(sessionId),
    });

    if (!result.success) {
      if (result.reason === 'Not enough capacity') {
        ctx.status = 409;
        ctx.body = {
          error: 'Capacity full',
          capacity: result.capacity,
        };
        return;
      }
      if (result.reason === 'Session not found') {
        return ctx.notFound(result.reason);
      }
      return ctx.internalServerError(result.reason);
    }

    ctx.status = 201;
    ctx.body = result.booking;
  },
}));
