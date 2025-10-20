/* eslint-disable @typescript-eslint/no-explicit-any */
import { upsertGoogleEvent } from './googleCalendar';
declare const strapi: any;

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export async function recalcAndSyncSession(sessionIdLike: string | number) {
  const sessionId = toNum(sessionIdLike);
  if (sessionId == null) return;

  const s = await strapi.entityService.findOne(
    'api::event-session.event-session',
    sessionId,
    {
      fields: ['id','title','type','startDateTime','durationMinutes','maxCapacity','googleEventId'] as any,
      populate: {
        bookings: { fields: ['id','status','peopleCount','customerEmail','customerName'] as any },
        product:  { fields: ['id','name','slug'] as any },
      },
    }
  ) as any;

  if (!s) return;

  const googleId = await upsertGoogleEvent(s);
  if (googleId && !s.googleEventId) {
    await strapi.entityService.update(
      'api::event-session.event-session',
      s.id,
      { data: { googleEventId: googleId } as any }
    );
  }
}

export async function recalcSessionsByTemporaryId(tempId: string) {
  if (!tempId) return;
  const bookings = await strapi.db.query('api::event-booking.event-booking').findMany({
    where: { temporaryId: tempId },
    select: ['id'],
    populate: { session: { select: ['id'] } },
  }) as any[];

  const ids = Array.from(new Set(
    bookings.map(b => toNum(b?.session?.id)).filter((n): n is number => n != null)
  ));

  for (const sid of ids) await recalcAndSyncSession(sid);
}

export async function recalcSessionsByOrderId(orderIdLike: string | number) {
  const orderIdStr = String(orderIdLike);
  if (!orderIdStr) return;

  const bookings = await strapi.db.query('api::event-booking.event-booking').findMany({
    where: { orderId: orderIdStr },
    select: ['id'],
    populate: { session: { select: ['id'] } },
  }) as any[];

  const ids = Array.from(new Set(
    bookings.map(b => toNum(b?.session?.id)).filter((n): n is number => n != null)
  ));

  for (const sid of ids) await recalcAndSyncSession(sid);
}
