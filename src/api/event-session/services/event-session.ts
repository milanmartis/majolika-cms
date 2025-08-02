// src/api/event-session/services/event-session.ts
import { factories } from '@strapi/strapi';

type BookingStatus = 'pending' | 'paid' | 'confirmed' | 'cancelled';

interface Booking {
  people_count?: number;
  status?: BookingStatus;
}

interface EventSession {
  id?: number;
  maxCapacity?: number;
  bookings?: Booking[];
}

interface BookingInput {
  peopleCount: number;
  status: BookingStatus;
  customerName?: string;
  customerEmail?: string;
  orderId?: string;
  session: number;
}

export default factories.createCoreService('api::event-session.event-session', ({ strapi }) => ({
  /**
   * Zistí kapacitu (booked / available / max) pre danú session.
   */
  async getCapacity(sessionId: number) {
    const session = await strapi.entityService.findOne(
      'api::event-session.event-session',
      sessionId,
      {
        fields: ['id', 'maxCapacity'],
        populate: { bookings: { fields: ['peopleCount', 'status'] } },
      }
    ) as unknown as EventSession;

    if (!session) return null;

    const booked = (session.bookings || [])
      .filter((b) => b.status === 'paid' || b.status === 'confirmed')
      .reduce((sum, b) => sum + (b.people_count || 0), 0);

    const available = Math.max(0, (session.maxCapacity || 0) - booked);
    return { booked, available, max: session.maxCapacity || 0 };
  },

  /**
   * Atomicky vytvorí booking iba ak je ešte voľná kapacita.
   */
  async createBookingIfAvailable(sessionId: number, bookingData: BookingInput) {
    return await strapi.db.connection.transaction(async (trx: any) => {
      // Zamkneme session riadok (snake_case názvy v SQL)
      const sessionRow = await trx('event_sessions')
        .select('id', 'max_capacity')
        .where({ id: sessionId })
        .forUpdate()
        .first();

      if (!sessionRow) {
        return { success: false, reason: 'Session not found' };
      }

      // Spočítame už potvrdené/paid rezervácie cez linking table
      const bookedRows = await trx('event_bookings as eb')
        .innerJoin(
          'event_bookings_session_lnk as lnk',
          'eb.id',
          'lnk.event_booking_id'
        )
        .where('lnk.event_session_id', sessionId)
        .whereIn('eb.status', ['paid', 'confirmed'])
        .select(trx.raw('COALESCE(SUM(eb.people_count), 0) as total'))
        .limit(1);

      const alreadyBooked = parseInt(bookedRows[0]?.total || '0', 10);
      const maxCap = sessionRow.max_capacity || 0;
      const available = Math.max(0, maxCap - alreadyBooked);

      if (bookingData.peopleCount > available) {
        return {
          success: false,
          reason: 'Not enough capacity',
          capacity: { booked: alreadyBooked, available, max: maxCap },
        };
      }

      // Vložíme nový booking (snake_case fields)
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

      // Spojíme booking so session cez linking table
      await trx('event_bookings_session_lnk').insert({
        event_booking_id: newBooking.id,
        event_session_id: sessionId,
        event_booking_ord: 0, // ak poradie nepotrebujete, nechajte 0
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
