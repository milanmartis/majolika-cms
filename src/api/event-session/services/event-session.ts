// path: src/api/event-session/services/event-session.ts
import { factories } from '@strapi/strapi';

type BookingStatus = 'pending' | 'paid' | 'confirmed' | 'cancelled';

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
   * Vrátí kapacitu: kolik je již zaplacených / potvrzených a kolik zbývá.
   */
  async getCapacity(sessionId: number) {
    // Načti session (pouze max_capacity) a její bookings přes join table
    const session = await strapi.entityService.findOne(
      'api::event-session.event-session',
      sessionId,
      {
        fields: ['id', 'maxCapacity'], // v JS je camelCase, Strapi mapuje na DB snake_case
        populate: {
          bookings: {
            fields: ['peopleCount', 'status'],
          },
        },
      }
    ) as any;

    if (!session) return null;

    const booked = (session.bookings || [])
      .filter((b: any) => b.status === 'paid' || b.status === 'confirmed')
      .reduce((sum: number, b: any) => sum + (b.peopleCount || 0), 0);

    const maxCap = session.maxCapacity || 0;
    const available = Math.max(0, maxCap - booked);
    return { booked, available, max: maxCap };
  },

  /**
   * Atomicky vytvoří booking jen pokud je kapacita dostupná.
   * Vrátí { success, booking?, capacity?, reason? }
   */
  async createBookingIfAvailable(sessionId: number, bookingData: BookingInput) {
    return await strapi.db.connection.transaction(async (trx: any) => {
      // Lock session row (pozor: v DB je sloupec max_capacity)
      const sessionRow = await trx('event_sessions')
        .select('id', 'max_capacity')
        .where({ id: sessionId })
        .forUpdate()
        .first();

      if (!sessionRow) {
        return { success: false, reason: 'Session not found' };
      }

      const maxCap: number = sessionRow.max_capacity || 0;

      // Spočítat už zarezervované (paid/confirmed) přes join table
      const bookedResult = await trx('event_bookings as eb')
        .join(
          'event_bookings_session_lnk as l',
          'l.event_booking_id',
          'eb.id'
        )
        .where('l.event_session_id', sessionId)
        .whereIn('eb.status', ['paid', 'confirmed'])
        .sum({ total: 'eb.people_count' })
        .first();

      const alreadyBooked = parseInt((bookedResult?.total || 0).toString(), 10);
      const available = Math.max(0, maxCap - alreadyBooked);

      if (bookingData.peopleCount > available) {
        return {
          success: false,
          reason: 'Not enough capacity',
          capacity: { booked: alreadyBooked, available, max: maxCap },
        };
      }

      // Vložíme nový booking
      const now = new Date();
      const [newBooking] = await trx('event_bookings')
        .insert({
          people_count: bookingData.peopleCount,
          status: bookingData.status,
          customer_name: bookingData.customerName || null,
          customer_email: bookingData.customerEmail || null,
          order_id: bookingData.orderId || null,
          created_at: now,
          updated_at: now,
          published_at: null,
        })
        .returning('*'); // PostgreSQL vrací vložený řádek

      // Vytvoříme link do join table
      await trx('event_bookings_session_lnk').insert({
        event_booking_id: newBooking.id,
        event_session_id: sessionId,
        event_booking_ord: 0, // případně uprav podle potřeby
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
