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

/**
 * Core service pre event-session: kapacita + atomické vytváranie bookingov s hold logikou.
 */
export default factories.createCoreService('api::event-session.event-session', ({ strapi }) => ({
  /**
   * Vráti kapacitu: koľko je booked (paid/confirmed) + recent pending (<10m) ako držané,
   * plus available a max.
   */
  async getCapacity(sessionId: number) {
    // načítaj session (len id + max_capacity)
    const session = await strapi.db.connection('event_sessions')
      .select('id', 'max_capacity')
      .where({ id: sessionId })
      .first() as EventSessionRow | undefined;

    if (!session) {
      return null;
    }

    // načítaj všetky relevantné bookingy (paid/confirmed alebo recent pending)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // join cez linking tabuľku, získame všetky eb s ich statusom a created_at
    const bookingRows: any[] = await strapi.db.connection('event_bookings as eb')
      .innerJoin('event_bookings_session_lnk as lnk', 'eb.id', 'lnk.event_booking_id')
      .where('lnk.event_session_id', sessionId)
      .select(
        'eb.status',
        'eb.created_at',
        strapi.db.connection.raw('COALESCE(eb.people_count, 0) as people_count')
      );

    // spočítaj "booked" vrátane recent pending (<10m)
    let bookedTotal = 0;
    for (const b of bookingRows) {
      if (b.status === 'paid' || b.status === 'confirmed') {
        bookedTotal += parseInt(b.people_count + '' || '0', 10);
      } else if (b.status === 'pending') {
        const created = new Date(b.created_at);
        if (created >= tenMinutesAgo) {
          bookedTotal += parseInt(b.people_count + '' || '0', 10);
        }
      }
    }

    const maxCap = session.max_capacity ?? 0;
    const available = Math.max(0, maxCap - bookedTotal);

    return {
      booked: bookedTotal,
      available,
      max: maxCap,
    };
  },

  /**
   * Atomicky vytvorí booking len ak je voľná kapacita (berie do úvahy paid/confirmed,
   * ale *ne*počítá pending staršie než 10 minút ako hold tu – to sa rieši v getCapacity).
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

      // spočítaj existujúce confirmed/paid rezervácie
      const bookedRows = await trx('event_bookings as eb')
        .innerJoin('event_bookings_session_lnk as lnk', 'eb.id', 'lnk.event_booking_id')
        .where('lnk.event_session_id', sessionId)
        .whereIn('eb.status', ['paid', 'confirmed'])
        .sum({ total: trx.raw('COALESCE(eb.people_count, 0)') })
        .limit(1);

      const alreadyBooked = Math.max(0, parseInt(((bookedRows[0]?.total || '0') + ''), 10));
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

      // prepojenie cez link tabuľku (M:N)
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
   * Aktualizuje stav existujúcej rezervácie (napr. z pending na cancelled).
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
