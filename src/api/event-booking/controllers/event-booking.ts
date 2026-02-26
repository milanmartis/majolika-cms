// src/api/event-booking/controllers/event-booking.ts

import { factories } from '@strapi/strapi';

interface UpdateBookingData {
  status?: 'pending' | 'paid' | 'confirmed' | 'cancelled';
  peopleCount?: number;
  temporaryId?: string;
}

export default factories.createCoreController('api::event-booking.event-booking', ({ strapi }) => ({

  async create(ctx) {
    const {
      session: sessionId,
      peopleCount,
      customerName,
      customerEmail,
      customerPhone,
      orderId,
      temporaryId, // ← Pridane
    } = ctx.request.body.data || {};


      // 1) telefón z FE (ak prišiel)
        let resolvedPhone =
        (customerPhone ?? '').toString().trim();

      // 2) ak chýba a prišiel orderId → načítaj z objednávky
      if (!resolvedPhone && orderId) {
        const order = await strapi.entityService.findOne('api::order.order', Number(orderId), {
          populate: ['customer'],
        });
        resolvedPhone =
          (order as any)?.customerPhone?.toString().trim() ||
          (order as any)?.customer?.phone?.toString().trim() ||
          '';
      }

      // 3) ak stále nič → skús Customer podľa emailu
      if (!resolvedPhone && customerEmail) {
        const customers = await strapi.entityService.findMany('api::customer.customer', {
          filters: { email: customerEmail },
          limit: 1,
        });
        resolvedPhone = customers?.[0]?.phone?.toString().trim() || '';
      }

      // 4) ľahká sanitizácia (+ číslice/medzery)
      resolvedPhone = resolvedPhone ? resolvedPhone.replace(/[^\d+\s]/g, '') : null;

    if (!sessionId || !peopleCount) {
      return ctx.badRequest('Missing required fields: session and peopleCount');
    }

    // Kapacitná kontrola
    const sessionService = strapi.service('api::event-session.event-session');
    const cap = await sessionService.getCapacity(Number(sessionId));
    if (cap.available < Number(peopleCount)) {
      ctx.status = 409;
      ctx.body = { error: 'Capacity full', capacity: cap };
      return;
    }

    // Vytvor booking vrátane temporaryId
    const booking = await strapi.entityService.create('api::event-booking.event-booking', {
      data: {
        peopleCount: Number(peopleCount),
        status: 'pending',
        customerName,
        customerEmail,
        customerPhone: resolvedPhone,
        orderId,
        session: Number(sessionId),
        temporaryId, // ← Tu ulož aj temporaryId!
      }as any,
    });

    ctx.status = 201;
    ctx.body = booking;
  },

  async update(ctx) {
    const bookingId = ctx.params.id;
    const data = ctx.request.body.data as UpdateBookingData || {};

    if (!data.status && data.peopleCount === undefined) {
      return ctx.badRequest('Missing status or peopleCount');
    }

    const updateData: UpdateBookingData = {};
    if (data.status) updateData.status = data.status;
    if (data.peopleCount !== undefined) updateData.peopleCount = Number(data.peopleCount);

    try {
      const updated = await strapi.entityService.update(
        'api::event-booking.event-booking',
        bookingId,
        { data: updateData }
      );
      ctx.body = updated;
    } catch (e) {
      strapi.log.error('Failed to update booking', e);
      return ctx.internalServerError('Failed to update booking');
    }
  },

}));
