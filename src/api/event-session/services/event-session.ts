// src/api/event-session/services/event-session.ts
import { factories } from '@strapi/strapi';

type BookingStatus = 'pending' | 'paid' | 'confirmed' | 'cancelled';

interface EventSessionRow {
  id: number;
  max_capacity?: number;
}

interface BookingRow {
  id: number;
  people_count?: number;
  status?: BookingStatus;
  created_at?: string;
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
   * Vráti kapacitu: koľko je booked (paid/confirmed), plus recent pending <10min ako hold,
   * available a max.
   */
  async getCapacity(sessionId: number) {
    // Najprv získaj session row (len id + max_capacity)
    const session = await strapi.db.connection('event_sessions')
      .select('id', 'max_capacity')
      .where({ id: sessionId })
      .first() as EventSessionRow | undefined;

    if (!session) {
      return null;
    }

    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // Získaj všetky bookingy pre session cez linking tabuľku
    const bookingRows: BookingRow[] = await strapi.db.connection('event_bookings as eb')
      .innerJoin(
        'event_bookings_session_lnk as lnk',
        'eb.id',
        'lnk.event_booking_id'
      )
      .where('lnk.event_session_id', sessionId)
      .select(
        'eb.id',
        'eb.status',
        'eb.people_count',
        'eb.created_at'
      );

    // Spočítaj "booked" vrátane recent pending (≤10 minút)
    let bookedCount = 0;
    bookingRows.forEach((b: any) => {
      if (b.status === 'paid' || b.status === 'confirmed') {
        bookedCount += Number(b.people_count || 0);
        return;
      }
      if (b.status === 'pending') {
        const created = new Date(b.created_at);
        if (created >= tenMinutesAgo) {
          bookedCount += Number(b.people_count || 0);
        }
      }
    });

    const maxCap = session.max_capacity ?? 0;
    const available = Math.max(0, maxCap - bookedCount);

    return {
      booked: bookedCount,
      available,
      max: maxCap,
    };
  },

  /**
   * Atomicky vytvorí booking len ak je voľná kapacita.
   */
  async createBookingIfAvailable(sessionId: number, bookingData: BookingInput) {
    return await strapi.db.connection.transaction(async (trx: any) => {
      // Uzamkneme session row pre update-safe čítanie
      const sessionRow = await trx('event_sessions')
        .select('id', 'max_capacity')
        .where({ id: sessionId })
        .forUpdate()
        .first();

      if (!sessionRow) {
        return { success: false, reason: 'Session not found' };
      }

      const maxCap = sessionRow.max_capacity || 0;

      // Získaj existujúce bookingy vrátane recent pending ako hold
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

      const bookingRows: any[] = await trx('event_bookings as eb')
        .innerJoin(
          'event_bookings_session_lnk as lnk',
          'eb.id',
          'lnk.event_booking_id'
        )
        .where('lnk.event_session_id', sessionId)
        .select(
          'eb.status',
          'eb.people_count',
          'eb.created_at'
        );

      let alreadyBooked = 0;
      bookingRows.forEach(b => {
        if (b.status === 'paid' || b.status === 'confirmed') {
          alreadyBooked += Number(b.people_count || 0);
          return;
        }
        if (b.status === 'pending') {
          const created = new Date(b.created_at);
          if (created >= tenMinutesAgo) {
            alreadyBooked += Number(b.people_count || 0);
          }
        }
      });

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

      // Vložíme nový booking
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

      // Prepojíme cez linking tabuľku
      await trx('event_bookings_session_lnk').insert({
        event_booking_id: newBooking.id,
        event_session_id: sessionId,
        event_booking_ord: 0,
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
   * Aktualizuje stav existujúcej rezervácie.
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
