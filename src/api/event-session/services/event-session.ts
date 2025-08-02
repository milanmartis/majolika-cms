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

export default factories.createCoreService('api::event-session.event-session', ({ strapi }) => ({
  /**
   * Vracia kapacitu (booked / available / max) pre dané session ID.
   * Zohľadňuje many-to-many väzbu cez event_bookings_session_lnk.
   */
  async getCapacity(sessionId: number) {
    // Získaj max_capacity s lockom nie je potrebný pre čítanie
    const sessionRow = await strapi.db.connection('event_sessions')
      .select('id', 'max_capacity')
      .where({ id: sessionId })
      .first();

    if (!sessionRow) return null;

    // Spočíta už potvrdené / zaplatené rezervácie cez linkovaciu tabuľku
    const bookedResult = await strapi.db.connection
      .from('event_bookings as eb')
      .join('event_bookings_session_lnk as lnk', 'eb.id', 'lnk.event_booking_id')
      .where('lnk.event_session_id', sessionId)
      .whereIn('eb.status', ['paid', 'confirmed'])
      .sum(strapi.db.connection.raw('COALESCE(eb.people_count, 0) as total'));

    // bookedResult môže byť vo forme [ { total: 'X' } ] alebo { total: 'X' } závisí od verzie knex
    let alreadyBooked = 0;
    if (Array.isArray(bookedResult)) {
      alreadyBooked = parseInt((bookedResult[0] as any)?.total || '0', 10);
    } else {
      alreadyBooked = parseInt((bookedResult as any)?.total || '0', 10);
    }

    const maxCap = sessionRow.max_capacity || 0;
    const available = Math.max(0, maxCap - alreadyBooked);
    return {
      booked: alreadyBooked,
      available,
      max: maxCap,
    };
  },

  /**
   * Atomicky vytvorí booking iba keď je kapacita dostupná.
   * Vkladá do event_bookings a následne do linkovacej tabuľky.
   */
  async createBookingIfAvailable(sessionId: number, bookingData: BookingInput) {
    return await strapi.db.connection.transaction(async (trx: any) => {
      // Lock session row pre súbežné zápisy
      const sessionRow = await trx('event_sessions')
        .select('id', 'max_capacity')
        .where({ id: sessionId })
        .forUpdate()
        .first();

      if (!sessionRow) {
        return { success: false, reason: 'Session not found' };
      }

      // Spočítaj už existujúce paid/confirmed rezervácie cez linkovaciu tabuľku
      const bookedRowsRaw = await trx
        .from('event_bookings as eb')
        .join('event_bookings_session_lnk as lnk', 'eb.id', 'lnk.event_booking_id')
        .where('lnk.event_session_id', sessionId)
        .whereIn('eb.status', ['paid', 'confirmed'])
        .sum(trx.raw('COALESCE(eb.people_count, 0) as total'));

      let alreadyBooked = 0;
      if (Array.isArray(bookedRowsRaw)) {
        alreadyBooked = parseInt((bookedRowsRaw[0] as any)?.total || '0', 10);
      } else {
        alreadyBooked = parseInt((bookedRowsRaw as any)?.total || '0', 10);
      }

      const maxCap = sessionRow.max_capacity || 0;
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

      // Vytvor nový booking
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
        .returning('*');

      // Prepojenie booking ↔ session
      await trx('event_bookings_session_lnk').insert({
        event_booking_id: newBooking.id,
        event_session_id: sessionId,
        event_booking_ord: 0, // podľa potreby uprav
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
