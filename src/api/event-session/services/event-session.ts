import { factories } from '@strapi/strapi';

type BookingStatus = 'pending' | 'paid' | 'confirmed' | 'cancelled';

interface EventSession {
  id?: number;
  maxCapacity?: number;
  bookings?: Array<{
    peopleCount?: number;
    status?: BookingStatus;
  }>;
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

  async createBookingIfAvailable(sessionId: number, bookingData: BookingInput) {
    return await strapi.db.connection.transaction(async (trx: any) => {
      // správne názvy stĺpcov: max_capacity
      const sessionRow = await trx('event_sessions')
        .select('id', 'max_capacity')
        .where({ id: sessionId })
        .forUpdate()
        .first();

      if (!sessionRow) {
        return { success: false, reason: 'Session not found' };
      }

      // spočítaj už zaplatené/confirmované rezervácie: people_count
      const bookedRows = await trx('event_bookings')
        .where({ session: sessionId })
        .whereIn('status', ['paid', 'confirmed'])
        .sum({ total: 'people_count' }); // Knex sum alias

      const alreadyBooked = parseInt(String(bookedRows[0]?.total || '0'), 10);
      const maxCap = sessionRow.max_capacity || 0;
      const available = Math.max(0, maxCap - alreadyBooked);

      if (bookingData.peopleCount > available) {
        return {
          success: false,
          reason: 'Not enough capacity',
          capacity: { booked: alreadyBooked, available, max: maxCap },
        };
      }

      // vloženie bookingu – používa snake_case
      const [newBooking] = await trx('event_bookings')
        .insert({
          people_count: bookingData.peopleCount,
          status: bookingData.status,
          customer_name: bookingData.customerName || null,
          customer_email: bookingData.customerEmail || null,
          order_id: bookingData.orderId || null,
          session: sessionId,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

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
