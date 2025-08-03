// path: src/api/event-session/services/event-session.ts
import { factories } from '@strapi/strapi';

type BookingStatus = 'pending' | 'paid' | 'confirmed' | 'cancelled';

interface EventSessionRow {
  id: number;
  max_capacity?: number;
}

interface BookingInput {
  peopleCount: number;
  status: BookingStatus;
  customerName?: string | null;
  customerEmail?: string | null;
  orderId?: string | null;
  session: number;
}

export default factories.createCoreService('api::event-session.event-session', ({ strapi }) => ({
  /**
   * Vráti kapacitu: koľko je booked (paid/confirmed), available a max.
   */
  async getCapacity(sessionId: number) {
    // najprv nájdi session (len id + max_capacity)
    const session = await strapi.db.connection('event_sessions')
      .select('id', 'max_capacity')
      .where({ id: sessionId })
      .first() as EventSessionRow | undefined;

    if (!session) {
      return null;
    }

    // spočítaj už potvrdené / zaplatené rezervácie cez join
    const bookedResult = await strapi.db.connection('event_bookings as eb')
      .innerJoin('event_bookings_session_lnk as lnk', 'eb.id', 'lnk.event_booking_id')
      .where('lnk.event_session_id', sessionId)
      .whereIn('eb.status', ['paid', 'confirmed'])
      .sum({ total: strapi.db.connection.raw('COALESCE(eb.people_count, 0)') })
      .limit(1);

    // Knack: knex returns array with object like { total: '3' } or { total: null }
    const alreadyBookedStr = (bookedResult[0] as any)?.total;
    const alreadyBooked = Math.max(0, parseInt(alreadyBookedStr || '0', 10));
    const maxCap = session.max_capacity ?? 0;
    const available = Math.max(0, maxCap - alreadyBooked);

    return {
      booked: alreadyBooked,
      available,
      max: maxCap,
    };
  },

  /**
   * Atomicky vytvorí booking len ak je voľná kapacita.
   */
  async createBookingIfAvailable(sessionId: number, bookingData: BookingInput) {
    return await strapi.db.connection.transaction(async (trx: any) => {
      // uzamkneme session row
      const sessionRow = await trx('event_sessions')
        .select('id', 'max_capacity')
        .where({ id: sessionId })
        .forUpdate()
        .first();

      if (!sessionRow) {
        return { success: false, reason: 'Session not found' };
      }

      const maxCap = sessionRow.max_capacity || 0;

      // spočítaj existujúce booked (paid/confirmed) rezervácie cez join
      const bookedRows = await trx('event_bookings as eb')
        .innerJoin('event_bookings_session_lnk as lnk', 'eb.id', 'lnk.event_booking_id')
        .where('lnk.event_session_id', sessionId)
        .whereIn('eb.status', ['paid', 'confirmed'])
        .sum({ total: trx.raw('COALESCE(eb.people_count, 0)') })
        .limit(1);

      const alreadyBooked = Math.max(0, parseInt((bookedRows[0]?.total || '0') + '', 10));
      const available = Math.max(0, maxCap - alreadyBooked);

      if (bookingData.peopleCount > available) {
        return {
          success: false,
          reason: 'Not enough capacity',
          capacity: {
            booked: alreadyBooked,
            available,
            max: maxCap,
          },
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
        })
        .returning('*');

      // prepojenie cez linking tabuľku (many-to-many)
      await trx('event_bookings_session_lnk').insert({
        event_booking_id: newBooking.id,
        event_session_id: sessionId,
        event_booking_ord: 0, // ak potrebujete poradie, uprav podľa logiky
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

  /**
   * Zruší / aktualizuje stav existujúcej rezervácie.
   */
  async updateBookingStatus(bookingId: number, status: BookingStatus) {
    const updated = await strapi.entityService.update(
      'api::event-booking.event-booking',
      bookingId,
      { data: { status } }
    );
    return updated;
  },
}));
