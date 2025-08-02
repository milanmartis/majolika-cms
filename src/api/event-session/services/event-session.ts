// src/api/event-session/services/event-session.ts
import { factories } from '@strapi/strapi';

type BookingStatus = 'pending' | 'paid' | 'confirmed' | 'cancelled';

interface BookingInput {
  peopleCount: number;
  status: BookingStatus;
  customerName?: string | null;
  customerEmail?: string | null;
  orderId?: string | null;
  session: number;
}

interface EventSessionRow {
  id?: number;
  max_capacity?: number;
}

export default factories.createCoreService('api::event-session.event-session', ({ strapi }) => ({
  /**
   * Získa kapacitu (booked / available / max) pre danú session.
   * Počíta len confirmed/paid bookingy.
   */
  async getCapacity(sessionId: number) {
    // najprv vyhľadaj session (pre istotu)
    const session = await strapi.db.connection('event_sessions')
      .select('id', 'max_capacity')
      .where({ id: sessionId })
      .first() as unknown as EventSessionRow;

    if (!session) {
      return null;
    }

    // spočítaj už rezervované (paid|confirmed) cez join link tabuľku
    const bookedRows = await strapi.db.connection('event_bookings as eb')
      .join(
        'event_bookings_session_lnk as lnk',
        'eb.id',
        'lnk.event_booking_id'
      )
      .where('lnk.event_session_id', sessionId)
      .whereIn('eb.status', ['paid', 'confirmed'])
      .sum({ total: 'eb.people_count' })
      .first();

    const alreadyBooked = parseInt(String(bookedRows?.total || '0'), 10);
    const maxCap = session.max_capacity || 0;
    const available = Math.max(0, maxCap - alreadyBooked);
    return { booked: alreadyBooked, available, max: maxCap };
  },

  /**
   * Atomicky vytvorí booking iba ak je kapacita dostupná.
   * Vkladá do event_bookings a potom do link tabuľky.
   */
  async createBookingIfAvailable(sessionId: number, bookingData: BookingInput) {
    return await strapi.db.connection.transaction(async (trx: any) => {
      // lock session row
      const sessionRow = await trx('event_sessions')
        .select('id', 'max_capacity')
        .where({ id: sessionId })
        .forUpdate()
        .first();

      if (!sessionRow) {
        return { success: false, reason: 'Session not found' };
      }

      // spočítaj existujúce confirmed/paid bookingy cez link tabuľku
      const bookedRows = await trx('event_bookings as eb')
        .join(
          'event_bookings_session_lnk as lnk',
          'eb.id',
          'lnk.event_booking_id'
        )
        .where('lnk.event_session_id', sessionId)
        .whereIn('eb.status', ['paid', 'confirmed'])
        .sum(trx.raw('COALESCE(eb.people_count, 0) as total'))
        .first();

      const alreadyBooked = parseInt(String(bookedRows?.total || '0'), 10);
      const maxCap = sessionRow.max_capacity || 0;
      const available = Math.max(0, maxCap - alreadyBooked);

      if (bookingData.peopleCount > available) {
        return {
          success: false,
          reason: 'Not enough capacity',
          capacity: { booked: alreadyBooked, available, max: maxCap },
        };
      }

      // vlož nový booking
      const [newBooking] = await trx('event_bookings')
        .insert({
          people_count: bookingData.peopleCount,
          status: bookingData.status,
          customer_name: bookingData.customerName || null,
          customer_email: bookingData.customerEmail || null,
          order_id: bookingData.orderId || null,
          created_at: new Date(),
          updated_at: new Date(),
          published_at: null,
        })
        .returning('*'); // PostgreSQL

      // vlož link medzi bookingom a session
      await trx('event_bookings_session_lnk').insert({
        event_booking_id: newBooking.id,
        event_session_id: sessionId,
        event_booking_ord: 0, // ak nepotrebné, môže byť 0
      });

      return {
        success: true,
        booking: newBooking,
        capacity: {
          booked: alreadyBooked + bookingData.peopleCount,
          available: Math.max(0, maxCap - (alreadyBooked + bookingData.peopleCount)),
          max: maxCap,
        },
      };
    });
  },
}));
