// src/api/event-booking/controllers/event-booking.ts
import { factories } from '@strapi/strapi';

interface UpdateBookingData {
  status?: 'pending' | 'paid' | 'confirmed' | 'cancelled';
  peopleCount?: number;
  temporaryId?: string;
}

function isCountedStatus(s?: string) {
  const v = String(s || '').toLowerCase();
  return v === 'paid' || v === 'confirmed';
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
      temporaryId,
    } = ctx.request.body.data || {};

    // 1) telefón z FE (ak prišiel)
    let resolvedPhone = (customerPhone ?? '').toString().trim();

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

    const requestedPeople = Number(peopleCount);
    if (!Number.isFinite(requestedPeople) || requestedPeople < 1) {
      return ctx.badRequest('Invalid peopleCount');
    }

    // ✅ Kapacitná kontrola (MUSÍ rátať aj Google BLOCK cez sessionService.getCapacity)
    const sessionService = strapi.service('api::event-session.event-session');
    const cap = await sessionService.getCapacity(Number(sessionId));

    if (cap.available < requestedPeople) {
      ctx.status = 409;
      ctx.body = { error: 'Capacity full', capacity: cap };
      return;
    }

    // Vytvor booking (pending)
    const booking = await strapi.entityService.create('api::event-booking.event-booking', {
      data: {
        peopleCount: requestedPeople,
        status: 'pending',
        customerName,
        customerEmail,
        customerPhone: resolvedPhone,
        orderId,
        session: Number(sessionId),
        temporaryId,
      } as any,
    });

    ctx.status = 201;
    ctx.body = booking;
  },

  async update(ctx) {
    const bookingId = Number(ctx.params.id);
    const data = (ctx.request.body.data as UpdateBookingData) || {};

    if (!bookingId) return ctx.badRequest('Invalid booking id');

    if (!data.status && data.peopleCount === undefined) {
      return ctx.badRequest('Missing status or peopleCount');
    }

    // ✅ načítaj existujúci booking, aby sme vedeli správne dorátať delta
    const existing: any = await strapi.entityService.findOne('api::event-booking.event-booking', bookingId, {
      fields: ['id', 'status', 'peopleCount'] as any,
      populate: { session: { fields: ['id'] as any } as any } as any,
    });

    if (!existing) return ctx.notFound('Booking not found');

    const sessionId = Number(existing?.session?.id);
    if (!sessionId) return ctx.badRequest('Booking has no session');

    const oldStatus = String(existing.status || 'pending');
    const newStatus = data.status ? String(data.status) : oldStatus;

    const oldPeople = Number(existing.peopleCount || 0);
    const newPeople = data.peopleCount !== undefined ? Number(data.peopleCount) : oldPeople;

    if (!Number.isFinite(newPeople) || newPeople < 1) {
      return ctx.badRequest('Invalid peopleCount');
    }

    const countedBefore = isCountedStatus(oldStatus);
    const countedAfter = isCountedStatus(newStatus);

    // ✅ Kapacitná kontrola v update:
    // - keď prechádzaš na paid/confirmed
    // - alebo keď meníš peopleCount pri paid/confirmed (napr. zvýšenie)
    if (countedAfter) {
      const sessionService = strapi.service('api::event-session.event-session');
      const cap = await sessionService.getCapacity(sessionId);

      // koľko miest navyše teraz potrebujem oproti tomu, čo už bolo započítané?
      const alreadyCountedPeople = countedBefore ? oldPeople : 0;
      const needAdditional = newPeople - alreadyCountedPeople;

      // ak znižuješ, needAdditional môže byť <= 0 → OK
      if (needAdditional > 0 && cap.available < needAdditional) {
        ctx.status = 409;
        ctx.body = {
          error: 'Capacity full',
          capacity: cap,
          detail: { oldPeople, newPeople, oldStatus, newStatus, needAdditional },
        };
        return;
      }
    }

    const updateData: UpdateBookingData = {};
    if (data.status) updateData.status = data.status;
    if (data.peopleCount !== undefined) updateData.peopleCount = newPeople;
    if (data.temporaryId !== undefined) updateData.temporaryId = data.temporaryId;

    try {
      const updated = await strapi.entityService.update(
        'api::event-booking.event-booking',
        bookingId,
        { data: updateData as any }
      );
      ctx.body = updated;
    } catch (e) {
      strapi.log.error('Failed to update booking', e);
      return ctx.internalServerError('Failed to update booking');
    }
  },

}));