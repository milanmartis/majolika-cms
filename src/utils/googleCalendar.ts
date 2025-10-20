// src/utils/googleCalendar.ts
import { google } from 'googleapis';
import pRetry from 'p-retry';

function getCalendar() {
  const email = process.env.GOOGLE_SA_EMAIL;
  const keyRaw = process.env.GOOGLE_SA_KEY;
  if (!email || !keyRaw) {
    throw new Error('Missing GOOGLE_SA_EMAIL or GOOGLE_SA_KEY');
  }

  const jwt = new google.auth.JWT({
    email,
    key: keyRaw.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth: jwt });
}

type Booking = { status?: string; peopleCount?: number };

export function occupancyFromBookings(bookings: Booking[] = []) {
  const ok = new Set(['paid', 'confirmed']);
  return bookings
    .filter(b => ok.has((b.status || '').toLowerCase()))
    .reduce((sum, b) => sum + Number(b.peopleCount || 0), 0);
}

function buildSummary(baseTitle: string, reserved: number, cap: number) {
  const full = cap && reserved >= cap;
  return `${baseTitle} — ${reserved}/${cap}${full ? ' (VYPREDANÉ)' : ''}`;
}

export async function upsertGoogleEvent(session: any) {
  if (process.env.GCAL_SYNC_ENABLED !== 'true') return null;

  const calendar = getCalendar();
  const calendarId = String(process.env.GOOGLE_CALENDAR_ID);

  const start = new Date(session.startDateTime);
  const duration = Number(session.durationMinutes ?? 60);
  const end = new Date(start.getTime() + duration * 60000);

  const reserved = occupancyFromBookings(session.bookings || []);
  const cap = Number(session.maxCapacity || 0);
  const summary = buildSummary(
    session.title || (session.type === 'workshop' ? 'Workshop' : 'Prehliadka'),
    reserved,
    cap
  );

  const full = cap && reserved >= cap;

  const requestBody: any = {
    summary,
    description: [
      session.product?.name ? `Produkt: ${session.product.name}` : null,
      session.product?.slug ? `Slug: ${session.product.slug}` : null,
      `Obsadenosť: ${reserved}/${cap}`,
      session.public_url ? `Registrácia: ${session.public_url}` : null,
    ].filter(Boolean).join('\n'),
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Prague' },     // alebo Bratislava, ale konzistentne
    end:   { dateTime: end.toISOString(),   timeZone: 'Europe/Prague' },
    location: session.product?.name || undefined,
    colorId: full ? '11' : undefined, // 11 ~ červená
    extendedProperties: { private: { strapiSessionId: String(session.id) } }
  };

  const doCall = async () => {
    if (session.googleEventId) {
      const { data } = await calendar.events.patch({
        calendarId,
        eventId: session.googleEventId,
        requestBody,
      });
      return data.id;
    } else {
      const { data } = await calendar.events.insert({
        calendarId,
        requestBody,
      });
      return data.id;
    }
  };

  const eventId = await pRetry(doCall, {
    retries: 4,
    factor: 2,
    minTimeout: 500,
    maxTimeout: 4000,
    onFailedAttempt: (err: any) => {
      // @ts-ignore - strapi typy nemusia byť vždy viditeľné
      strapi?.log?.warn?.(`[gcal] attempt ${err.attemptNumber} failed: ${err.message}`);
    }
  });

  return eventId;
}

export async function deleteGoogleEvent(googleEventId: string) {
  if (process.env.GCAL_SYNC_ENABLED !== 'true') return;
  if (!googleEventId) return;

  const calendar = getCalendar();
  const calendarId = String(process.env.GOOGLE_CALENDAR_ID);

  const doCall = async () => {
    await calendar.events.delete({ calendarId, eventId: googleEventId });
  };

  await pRetry(doCall, { retries: 3, factor: 2, minTimeout: 500, maxTimeout: 3000 });
}
