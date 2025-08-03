import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::event-booking.event-booking', ({ strapi }) => ({

  // CREATE booking
  async create(ctx) {
    const { session: sessionId, peopleCount, customerName, customerEmail, orderId } = ctx.request.body.data || {};

    if (!sessionId || !peopleCount) {
      return ctx.badRequest('Missing required fields: session and peopleCount');
    }

    // Kontrola kapacity (dynamicky)
    const sessionService = strapi.service('api::event-session.event-session');
    const cap = await sessionService.getCapacity(Number(sessionId));
    if (cap.available < Number(peopleCount)) {
      ctx.status = 409;
      ctx.body = { error: 'Capacity full', capacity: cap };
      return;
    }

    // Vytvor booking
    const booking = await strapi.entityService.create('api::event-booking.event-booking', {
      data: {
        peopleCount: Number(peopleCount),
        status: 'pending',
        customerName,
        customerEmail,
        orderId,
        session: Number(sessionId),
      }
    });

    ctx.status = 201;
    ctx.body = booking;
  },

  // UPDATE booking (napr. cancel)
  async update(ctx) {
    const bookingId = ctx.params.id;
    const { status } = ctx.request.body.data || {};

    if (!status) {
      return ctx.badRequest('Missing status');
    }

    try {
      const updated = await strapi.entityService.update(
        'api::event-booking.event-booking',
        bookingId,
        { data: { status } }
      );
      ctx.body = updated;
    } catch (e) {
      strapi.log.error('Failed to update booking status', e);
      return ctx.internalServerError('Failed to update booking');
    }
  },
}));
