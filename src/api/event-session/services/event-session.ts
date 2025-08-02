import { factories } from '@strapi/strapi';

type BookingStatus = 'pending' | 'paid' | 'confirmed' | 'cancelled';

interface Booking {
  peopleCount?: number;
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
      .reduce((sum, b) => sum + (b.peopleCount || 0), 0);

    const available = Math.max(0, (session.maxCapacity || 0) - booked);
    return { booked, available, max: session.maxCapacity || 0 };
  },

  /**
   * Atomically creates a booking only if there's enough capacity.
   */
  async createBookingIfAvailable(sessionId: number, bookingData: BookingInput) {
    return await strapi.db.connection.transaction(async (trx: any) => {
      // Lock the session row to avoid race conditions
      const sessionRow = await trx('event_sessions')
        .select('id', 'maxCapacity')
        .where({ id: sessionId })
        .forUpdate()
        .first();

      if (!sessionRow) {
        return { success: false, reason: 'Session not found' };
      }

      // Sum already booked (paid/confirmed)
      const bookedRows = await trx('event_bookings')
        .where({ session: sessionId })
        .whereIn('status', ['paid', 'confirmed'])
        .select(trx.raw('COALESCE(SUM("peopleCount"), 0) as total'));

      const alreadyBooked = parseInt(bookedRows[0]?.total || '0', 10);
      const maxCap = sessionRow.maxCapacity || 0;
      const available = Math.max(0, maxCap - alreadyBooked);

      if (bookingData.peopleCount > available) {
        return {
          success: false,
          reason: 'Not enough capacity',
          capacity: { booked: alreadyBooked, available, max: maxCap },
        };
      }

      // Insert new booking
      const [newBooking] = await trx('event_bookings')
        .insert({
          peopleCount: bookingData.peopleCount,
          status: bookingData.status,
          customerName: bookingData.customerName || null,
          customerEmail: bookingData.customerEmail || null,
          orderId: bookingData.orderId || null,
          session: sessionId,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*'); // PostgreSQL

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
