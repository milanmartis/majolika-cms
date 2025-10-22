// src/utils/googleCalendar.ts
import { google } from 'googleapis';
import pRetry from 'p-retry';

function getCalendar() {
  const email = process.env.GOOGLE_SA_EMAIL;
  const keyRaw = process.env.GOOGLE_SA_KEY;
  if (!email || !keyRaw) {
    throw new Error('Missing GOOGLE_SA_EMAIL or GOOGLE_SA_KEY');
  }

  // Ak máš Google Workspace a zapnutú Domain-Wide Delegation,
  // môžeš impersonovať vlastníka kalendára cez GCAL_IMPERSONATE
  const subject = process.env.GCAL_IMPERSONATE || undefined;

  const jwt = new google.auth.JWT({
    email,
    subject, // <- funguje len s DWD
    key: keyRaw.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth: jwt });
}

function getTimeZone(): string {
  return process.env.GCAL_TZ || 'Europe/Prague';
}

type Booking = {
  status?: string;
  peopleCount?: number;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
};

export function occupancyFromBookings(bookings: Booking[] = []) {
  const ok = new Set(['paid', 'confirmed']);
  return bookings
    .filter(b => ok.has((b.status || '').toLowerCase()))
    .reduce((sum, b) => sum + Number(b.peopleCount || 0), 0);
}
function allAttendeeLines(attendees: Array<{ email: string; displayName?: string }>) {
    if (!attendees.length) return [];
    return [
      'Účastníci:',
      ...attendees.map(a => {
        const email = (a.email || '').trim();
        const name  = (a.displayName || '').trim();
        if (email && name) return `• ${name} (${email})`;          // meno + email
        if (email)         return `• ${email}`;                     // len email
        if (name)          return `• ${name} (bez e-mailu)`;        // fallback bez emailu
        return '• (neznámy účastník)';
      }),
    ];
  }


function attendeeEmailsFromBookings(
  bookings: Booking[] = []
): Array<{ email: string; displayName?: string }> {
  const ok = new Set(['paid', 'confirmed']);
  const uniq = new Map<string, string | undefined>();

  for (const b of bookings) {
    if (!ok.has(String(b.status || '').toLowerCase())) continue;
    const e = (b.customerEmail || '').trim().toLowerCase();
    if (!e) continue;
    if (!uniq.has(e)) uniq.set(e, b.customerName || undefined);
  }

  const limit = Math.max(1, Number(process.env.GCAL_ATTENDEE_LIMIT || 10));
  return Array.from(uniq.entries())
    .slice(0, limit)
    .map(([email, displayName]) => ({ email, displayName }));
}

function buildSummary(baseTitle: string, reserved: number, cap: number) {
  const full = cap && reserved >= cap;
  return `${baseTitle} — ${reserved}/${cap}${full ? ' (VYPREDANÉ)' : ''}`;
}

function emailsCsv(attendees: Array<{ email: string; displayName?: string }>): string {
  return attendees.map(a => a.email).join(',');
}

function shouldIncludeAttendees(): boolean {
  // Fallback default: true (ak API dovolí). Môžeš vypnúť cez GCAL_INCLUDE_ATTENDEES=false
  return String(process.env.GCAL_INCLUDE_ATTENDEES ?? 'true').toLowerCase() !== 'false';
}

function isAttendeeError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  // typická hláška od Google:
  // "Service accounts cannot invite attendees without Domain-Wide Delegation of Authority."
  return msg.includes('service accounts') && msg.includes('cannot invite attendees');
}

export async function upsertGoogleEvent(session: any) {
  if (process.env.GCAL_SYNC_ENABLED !== 'true') return null;

  const calendar = getCalendar();
  const calendarId = String(process.env.GOOGLE_CALENDAR_ID);
  const tz = getTimeZone();

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

  const attendees = attendeeEmailsFromBookings(session.bookings || []);
  const includeAttendees = shouldIncludeAttendees();

  const descriptionLines = [
    session.product?.name ? `Produkt: ${session.product.name}` : null,
    session.product?.slug ? `Slug: ${session.product.slug}` : null,
    `Obsadenosť: ${reserved}/${cap}`,
    session.public_url ? `Registrácia: ${session.public_url}` : null,
  ].filter(Boolean) as string[];
  descriptionLines.push(...allAttendeeLines(attendees));

  // Ak chceš (napr. pre debug), dá sa prilepiť aj prvý email do description:
  if (String(process.env.GCAL_DESCRIPTION_PRIMARY_EMAIL || 'false').toLowerCase() === 'true') {
    if (attendees[0]?.email) descriptionLines.push(`Kontakt: ${attendees[0].email}`);
  }

  // Základný request body s attendees (ak povolené)
  const baseBody: any = {
    summary,
    description: descriptionLines.join('\n'),
    start: { dateTime: start.toISOString(), timeZone: tz },
    end:   { dateTime: end.toISOString(),   timeZone: tz },
    location: session.product?.name || undefined,
    colorId: full ? '11' : undefined,
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
    guestsCanModify: false,
    extendedProperties: {
      private: {
        strapiSessionId: String(session.id),
        primaryCustomerEmail: attendees[0]?.email || '',
        // ulož aj všetky e-maily pre istotu (API-only)
        attendeeEmails: emailsCsv(attendees),
      },
    },
  };

  const withAttendees = includeAttendees && attendees.length
    ? { ...baseBody, attendees }
    : baseBody;

  const withoutAttendees = { ...baseBody };
  delete (withoutAttendees as any).attendees;

  // Jedna funkcia na insert/patch s možnosťou vypnúť attendees
  const callOnce = async (useAttendees: boolean) => {
    const requestBody = useAttendees ? withAttendees : withoutAttendees;

    if (session.googleEventId) {
      const { data } = await calendar.events.patch({
        calendarId,
        eventId: session.googleEventId,
        requestBody,
        sendUpdates: 'none',
      });
      return data.id;
    } else {
      const { data } = await calendar.events.insert({
        calendarId,
        requestBody,
        sendUpdates: 'none',
      });
      return data.id;
    }
  };

  // Najprv sa pokúsime s attendees (ak povolené). Pri špecifickej chybe automaticky fallbackneme bez attendees.
  let eventId: string | null = null;

  const doCall = async () => {
    try {
      eventId = await callOnce(Boolean(includeAttendees && attendees.length));
    } catch (err: any) {
      // ak je to práve „Service accounts cannot invite attendees…“, retry bez attendees
      if (isAttendeeError(err)) {
        // @ts-ignore
        strapi?.log?.warn?.('[gcal] attendees not allowed by SA; retrying without attendees');
        eventId = await callOnce(false);
      } else {
        throw err;
      }
    }
    return eventId!;
  };

  const resultId = await pRetry(doCall, {
    retries: 4,
    factor: 2,
    minTimeout: 500,
    maxTimeout: 4000,
    onFailedAttempt: (err: any) => {
      // @ts-ignore
      strapi?.log?.warn?.(`[gcal] attempt ${err.attemptNumber} failed: ${err.message}`);
    },
  });

  return resultId;
}

export async function deleteGoogleEvent(googleEventId: string) {
  if (process.env.GCAL_SYNC_ENABLED !== 'true') return;
  if (!googleEventId) return;

  const calendar = getCalendar();
  const calendarId = String(process.env.GOOGLE_CALENDAR_ID);

  const doCall = async () => {
    await calendar.events.delete({ calendarId, eventId: googleEventId, sendUpdates: 'none' });
  };

  await pRetry(doCall, { retries: 3, factor: 2, minTimeout: 500, maxTimeout: 3000 });
}
