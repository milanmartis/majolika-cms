// src/api/event-session/controllers/event-session.ts
import { factories } from '@strapi/strapi';
import {
  listGoogleEventsInRange,
  getEventStartEndISO,
  overlaps,
  isExternalBlockingEvent,
  externalSeatsFromGoogleEvent,
  occupancyFromBookings,
} from '../../../utils/googleCalendar';

type EventType = 'workshop' | 'tour';

function toUtcBasic(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = dt.getUTCFullYear();
  const m = pad(dt.getUTCMonth() + 1);
  const d = pad(dt.getUTCDate());
  const hh = pad(dt.getUTCHours());
  const mm = pad(dt.getUTCMinutes());
  const ss = pad(dt.getUTCSeconds());
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function buildIcs(
  events: Array<{
    uid: string;
    title: string;
    start: Date;
    end: Date;
    description?: string;
    location?: string;
  }>
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//majolika.sk//Event Sessions//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  const dtstamp = toUtcBasic(new Date());
  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${esc(ev.uid)}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${toUtcBasic(ev.start)}`);
    lines.push(`DTEND:${toUtcBasic(ev.end)}`);
    lines.push(`SUMMARY:${esc(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
async function resolveProductDocumentIdFromAnySlug(strapi: any, slug: string): Promise<string | null> {
  // Skús nájsť produkt podľa slugu (v akomkoľvek locale)
  // Pozn.: Strapi “locale: 'all'” niekde funguje, niekde nie – preto robíme fallback.
  const tryFind = async (localeArg?: any) => {
    return await strapi.entityService.findMany('api::product.product', {
      filters: { slug: { $eq: slug } },
      fields: ['id', 'documentId', 'locale', 'slug'],
      populate: {
        localizations: { fields: ['id', 'documentId', 'locale', 'slug'] },
      },
      ...(localeArg ? { locale: localeArg } : {}),
      pagination: { page: 1, pageSize: 1 },
    });
  };

  let rows: any[] = [];
  try {
    rows = await tryFind('all');
  } catch {
    // fallback bez locale
    rows = await tryFind(undefined);
  }

  const p = rows?.[0];
  if (!p) return null;

  // documentId priamo
  if (p.documentId) return p.documentId as string;

  // alebo cez localizations
  const locs = p.localizations ?? p.localizations?.data ?? [];
  const locArr = Array.isArray(locs) ? locs : [];
  const hit = locArr.find((x: any) => (x?.slug ?? x?.attributes?.slug) === slug);
  const doc = hit?.documentId ?? hit?.attributes?.documentId ?? null;

  return doc;
}

function normalizeProductForFrontend(prod: any) {
  if (!prod) return null;
  // Strapi entityService vráti často “flat” object; keď by sa objavili attributes, zober aj tie.
  const p = prod.attributes ?? prod;

  const locsRaw = p.localizations?.data ?? p.localizations ?? [];
  const locs = Array.isArray(locsRaw)
    ? locsRaw.map((x: any) => (x.attributes ?? x))
    : [];

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    price_sale: p.price_sale,
    inSale: p.inSale,
    locale: p.locale,
    documentId: p.documentId,
    localizations: { data: locs },
  };
}
export default factories.createCoreController('api::event-session.event-session', ({ strapi }) => ({
  async ping(ctx) {
    strapi.log.debug('ping invoked');
    ctx.body = { ok: true, ts: new Date().toISOString() };
  },

  async findByProductSlug(ctx) {
    const { slug } = ctx.query;
  
    if (typeof slug !== 'string') {
      return ctx.badRequest('Missing or invalid slug parameter');
    }
  
    // 1️⃣ nájdi document_id z hocijakého jazyka
    const baseProduct = await strapi.db
      .query('api::product.product')
      .findOne({
        where: { slug },
        select: ['id', 'document_id'],
      });
  
    if (!baseProduct?.document_id) {
      return ctx.send({ data: [] });
    }
  
    const documentId = baseProduct.document_id;
  
    // 2️⃣ nájdi všetky jazykové verzie produktu
    const localizedProducts = await strapi.db
      .query('api::product.product')
      .findMany({
        where: { document_id: documentId },
        select: ['id'],
      });
  
    const productIds = localizedProducts.map(p => p.id);
  
    if (!productIds.length) {
      return ctx.send({ data: [] });
    }
  
    // 3️⃣ nájdi sessions podľa product.id IN (...)
    const sessions = await strapi.entityService.findMany(
      'api::event-session.event-session',
      {
        filters: {
          product: {
            id: { $in: productIds },
          },
        },
        fields: [
          'id',
          'title',
          'type',
          'startDateTime',
          'durationMinutes',
          'maxCapacity',
        ],
        populate: {
          product: {
            fields: ['id', 'name', 'slug', 'price', 'price_sale', 'inSale', 'locale'],
            populate: {
              localizations: {
                fields: ['id', 'slug', 'locale'],
              },
            },
          },
          series: {
            fields: [
              'id',
              'title',
              'seriesVersion',
              'frequency',
              'interval',
              'byWeekday',
              'timeOfDay',
            ],
          },
        },
        sort: { startDateTime: 'asc' },
      }
    );
  
    const sessionService = strapi.service('api::event-session.event-session');
  
    const withCapacity = await Promise.all(
      sessions.map(async (s: any) => {
        const cap = await sessionService.getCapacity(s.id);
        return {
          ...s,
          capacity: cap,
        };
      })
    );
  
    return ctx.send({ data: withCapacity });
  },

  async byDocument(ctx) {
    const { documentId } = ctx.query as any;
    if (!documentId) return ctx.badRequest('Missing documentId');
  
    // 1️⃣ nájdi všetky jazykové verzie produktu
    const products = await strapi.db
      .query('api::product.product')
      .findMany({
        where: { document_id: documentId },
        select: ['id'],
      });
  
    if (!products.length) {
      return ctx.send({ data: [] });
    }
  
    const productIds = products.map((p: any) => p.id);
  
    // 2️⃣ nájdi sessions podľa product.id IN (...)
    const sessions = await strapi.entityService.findMany(
      'api::event-session.event-session',
      {
        filters: {
          product: {
            id: { $in: productIds },
          },
        },
        populate: {
          product: {
            fields: ['id', 'name', 'slug', 'locale'],
            populate: { localizations: true },
          },
        },
        sort: { startDateTime: 'asc' },
      }
    );
  
    const sessionService = strapi.service('api::event-session.event-session');
    const withCapacity = await Promise.all(
      sessions.map(async (s: any) => {
        const cap = await sessionService.getCapacity(s.id);
        return { ...s, capacity: cap };
      })
    );
  
    ctx.body = { data: withCapacity };
  },

  async listForRange(ctx) {
    const { start, end } = ctx.query;
  
    if (!start || !end) {
      return ctx.badRequest('Missing start or end query param');
    }
  
    if (typeof start !== 'string' || typeof end !== 'string') {
      return ctx.badRequest('Invalid date range');
    }
  
    // očakávame formát YYYY-MM-DD
    const rx = /^(\d{4})-(\d{2})-(\d{2})$/;
  
    const ms = rx.exec(start);
    const me = rx.exec(end);
  
    if (!ms || !me) {
      return ctx.badRequest('Invalid date format, expected YYYY-MM-DD');
    }
  
    const startUtc = new Date(Date.UTC(
      Number(ms[1]),
      Number(ms[2]) - 1,
      Number(ms[3]),
      0, 0, 0, 0
    ));
  
    const endUtc = new Date(Date.UTC(
      Number(me[1]),
      Number(me[2]) - 1,
      Number(me[3]) + 1,   // posunieme na ďalší deň 00:00
      0, 0, 0, 0
    ));
  
    strapi.log.debug(
      `listForRange UTC range ${startUtc.toISOString()} -> ${endUtc.toISOString()}`
    );
  
    const sessions = await strapi.entityService.findMany(
      'api::event-session.event-session',
      {
        filters: {
          startDateTime: {
            $gte: startUtc.toISOString(),
            $lt: endUtc.toISOString(),
          },
        },
        fields: [
          'id',
          'title',
          'type',
          'startDateTime',
          'durationMinutes',
          'maxCapacity',
        ],
        populate: {
          product: {
            fields: [
              'id',
              'name',
              'slug',
              'price',
              'price_sale',
              'inSale',
              'locale',
            ],
            populate: {
              localizations: {
                fields: ['id', 'slug', 'locale'],
              },
            },
          },
          series: {
            fields: [
              'id',
              'title',
              'seriesVersion',
              'frequency',
              'interval',
              'byWeekday',
              'timeOfDay',
            ],
          },
        },
        sort: { startDateTime: 'asc' },
      }
    );
  
    const sessionService = strapi.service('api::event-session.event-session');
  
    const withCapacity = await Promise.all(
      (sessions as any[]).map(async (s: any) => {
        const cap = await sessionService.getCapacity(s.id);
        return {
          ...s,
          capacity: cap,
        };
      })
    );
  
    ctx.body = { data: withCapacity };
  },

  /** GET /event-sessions/:id/ics */
  async icsOne(ctx) {
    const id = Number(ctx.params.id);
    const s: any = await strapi.entityService.findOne('api::event-session.event-session', id, {
      populate: { product: { fields: ['id', 'name', 'slug'] } },
      fields: ['id', 'title', 'type', 'startDateTime', 'durationMinutes'],
    });
    if (!s) return ctx.notFound('Event session not found');

    const start = new Date(s.startDateTime);
    const end = new Date(start.getTime() + Number(s.durationMinutes ?? 60) * 60 * 1000);
    const title = s.title || (s.type === 'workshop' ? 'Workshop' : 'Prehliadka');

    const ics = buildIcs([
      {
        uid: `${s.id}@event-sessions`,
        title,
        start,
        end,
        description: s.product?.name ? `${title} – ${s.product.name}` : title,
        location: s.product?.name || '',
      },
    ]);

    ctx.set('Content-Type', 'text/calendar; charset=utf-8');
    ctx.set('Content-Disposition', `attachment; filename="event-session-${s.id}.ics"`);
    ctx.body = ics;
  },

  /** GET /event-sessions.ics?start=&end=&slug=&type= */
  async icsFeed(ctx) {
    const { start, end, slug, type } = ctx.query as Record<string, string | undefined>;

    const filters: any = {};
    if (start || end) {
      filters.startDateTime = {} as any;
      if (start) filters.startDateTime.$gte = new Date(String(start)).toISOString();
      if (end) {
        const e = new Date(String(end));
        e.setHours(23, 59, 59, 999);
        filters.startDateTime.$lte = e.toISOString();
      }
    }
    if (slug) filters.product = { slug: { $eq: slug } };
    if (type) filters.type = { $eq: type };

    const sessions: any[] = await strapi.entityService.findMany('api::event-session.event-session', {
      filters,
      populate: { product: { fields: ['id', 'name', 'slug'] } },
      fields: ['id', 'title', 'type', 'startDateTime', 'durationMinutes'],
      sort: { startDateTime: 'asc' },
    });

    const events = sessions.map((s) => {
      const start = new Date(s.startDateTime);
      const end = new Date(start.getTime() + Number(s.durationMinutes ?? 60) * 60 * 1000);
      const title = s.title || (s.type === 'workshop' ? 'Workshop' : 'Prehliadka');
      return {
        uid: `${s.id}@event-sessions`,
        title,
        start,
        end,
        description: s.product?.name ? `${title} – ${s.product.name}` : title,
        location: s.product?.name || '',
      };
    });

    const ics = buildIcs(events);
    ctx.set('Content-Type', 'text/calendar; charset=utf-8');
    ctx.set('Content-Disposition', 'attachment; filename="event-sessions.ics"');
    ctx.body = ics;
  },

  async calendar(ctx) {
    const { from, to, type, product, slug } = ctx.query as Record<string, string | undefined>;

    const filters: any = {};
    if (from || to) {
      filters.startDateTime = {} as any;
      if (from) filters.startDateTime.$gte = new Date(String(from)).toISOString();
      if (to) filters.startDateTime.$lte = new Date(String(to)).toISOString();
    }
    if (type) filters.type = { $eq: type };

    // podpora product id aj slug naraz
    const productFilter: any = {};
    if (product) productFilter.id = { $eq: Number(product) };
    if (slug) productFilter.slug = { $eq: slug };
    if (Object.keys(productFilter).length) filters.product = productFilter;

    const sessions = await strapi.entityService.findMany('api::event-session.event-session', {
      filters,
      fields: ['id', 'title', 'type', 'startDateTime', 'durationMinutes', 'maxCapacity'],
      populate: {
        bookings: { fields: ['id', 'status', 'peopleCount'] as any },
        product: { fields: ['id', 'name', 'slug'] },
      },
      sort: { startDateTime: 'asc' },
    });

    const fromISO = from ? new Date(String(from)).toISOString() : new Date(Date.now() - 7 * 864e5).toISOString();
    const toISO = to ? new Date(String(to)).toISOString() : new Date(Date.now() + 180 * 864e5).toISOString();
    const gEvents = await listGoogleEventsInRange(fromISO, toISO);

    const items = (sessions as any[]).map((s) => {
      const start = new Date(s.startDateTime);
      const dur = Number(s.durationMinutes ?? 60);
      const end = new Date(start.getTime() + dur * 60000);

      // ľudia zo Strapi bookingov
      const confirmedPeople = occupancyFromBookings(s.bookings || []);

      // len pre debug: počet bookingov (nie ľudí)
      const confirmedCount = Array.isArray(s.bookings)
        ? s.bookings.filter((b: any) => (b?.status ? ['paid', 'confirmed'].includes(b.status) : true)).length
        : 0;

      // externé BLOCK udalosti z Google
      const externalBlocked = gEvents
        .filter(isExternalBlockingEvent)
        .filter((ev: any) => {
          const se = getEventStartEndISO(ev);
          if (!se.start || !se.end) return false;
          return overlaps(se.start, se.end, start.toISOString(), end.toISOString());
        })
        .reduce((sum: number, ev: any) => sum + externalSeatsFromGoogleEvent(ev), 0);

      const totalBooked = confirmedPeople + externalBlocked;
      const available = Math.max(0, Number(s.maxCapacity) - totalBooked);

      return {
        id: s.id,
        title: s.title ?? (s.type === 'workshop' ? 'Workshop' : 'Prehliadka'),
        type: s.type,
        start: start.toISOString(),
        end: end.toISOString(),
        durationMinutes: dur,
        maxCapacity: s.maxCapacity,
        confirmedCount,
        confirmedPeople,
        externalBlocked,
        totalBooked,
        available,
        product: s.product ? { id: s.product.id, title: s.product.name, slug: s.product.slug } : null,
      };
    });

    ctx.body = { items };
  },

  async productCalendar(ctx) {
    const productId = Number(ctx.params.productId);
    if (!productId) return ctx.badRequest('Invalid productId');

    const q = ctx.query as Record<string, string | undefined>;
    const from = q.from || q.start;
    const to = q.to || q.end;
    const { type } = q;

    const filters: any = { product: { id: { $eq: productId } } };
    if (from || to) {
      filters.startDateTime = {} as any;
      if (from) filters.startDateTime.$gte = new Date(String(from)).toISOString();
      if (to) {
        const e = new Date(String(to));
        // ak používaš 'to' ako dátum bez času, posuň na koniec dňa
        if (!q.to && q.end) {
          /* no-op */
        } else {
          e.setHours(23, 59, 59, 999);
        }
        filters.startDateTime.$lte = e.toISOString();
      }
    }
    if (type) filters.type = { $eq: type };

    const sessions = await strapi.entityService.findMany('api::event-session.event-session', {
      filters,
      fields: ['id', 'title', 'type', 'startDateTime', 'durationMinutes', 'maxCapacity'],
      populate: {
        // ⚠️ potrebuješ peopleCount
        bookings: { fields: ['id', 'status', 'peopleCount'] as any },
        product: { fields: ['id', 'name', 'slug'] },
      },
      sort: { startDateTime: 'asc' },
    });

    // rovnaký range pre Google events (aby sme rátali BLOCK)
    const fromISO = from ? new Date(String(from)).toISOString() : new Date(Date.now() - 7 * 864e5).toISOString();
    const toISO = to ? new Date(String(to)).toISOString() : new Date(Date.now() + 180 * 864e5).toISOString();
    const gEvents = await listGoogleEventsInRange(fromISO, toISO);

    const sessionService = strapi.service('api::event-session.event-session');

    const items = await Promise.all(
      (sessions as any[]).map(async (s) => {
        const start = new Date(s.startDateTime);
        const dur = Number(s.durationMinutes ?? 60);
        const end = new Date(start.getTime() + dur * 60000);

        const confirmedPeople = occupancyFromBookings(s.bookings || []);
        const confirmedCount = Array.isArray(s.bookings)
          ? s.bookings.filter((b: any) => (b?.status ? ['paid', 'confirmed'].includes(b.status) : true)).length
          : 0;

        const externalBlocked = gEvents
          .filter(isExternalBlockingEvent)
          .filter((ev: any) => {
            const se = getEventStartEndISO(ev);
            if (!se.start || !se.end) return false;
            return overlaps(se.start, se.end, start.toISOString(), end.toISOString());
          })
          .reduce((sum: number, ev: any) => sum + externalSeatsFromGoogleEvent(ev), 0);

        const totalBooked = confirmedPeople + externalBlocked;
        const available = Math.max(0, Number(s.maxCapacity) - totalBooked);

        // ak máš getCapacity, môžeš ho pridať do výstupu:
        let capacity: any = null;
        if (sessionService?.getCapacity) {
          try {
            capacity = await sessionService.getCapacity(s.id);
          } catch (_) {}
        }

        return {
          id: s.id,
          title: s.title ?? (s.type === 'workshop' ? 'Workshop' : 'Prehliadka'),
          type: s.type,
          start: start.toISOString(),
          end: end.toISOString(),
          durationMinutes: dur,
          maxCapacity: s.maxCapacity,
          confirmedCount,
          confirmedPeople,
          externalBlocked,
          totalBooked,
          available,
          capacity,
          product: s.product ? { id: s.product.id, title: s.product.name, slug: s.product.slug } : null,
        };
      })
    );

    ctx.body = { items };
  },

  /** GET /products/:productId/event-sessions.ics?start=&end=&type= */
  async productIcsFeed(ctx) {
    const productId = Number(ctx.params.productId);
    const { start, end, type } = ctx.query as Record<string, string | undefined>;

    const filters: any = { product: { id: { $eq: productId } } };
    if (start || end) {
      filters.startDateTime = {} as any;
      if (start) filters.startDateTime.$gte = new Date(String(start)).toISOString();
      if (end) {
        const e = new Date(String(end));
        e.setHours(23, 59, 59, 999);
        filters.startDateTime.$lte = e.toISOString();
      }
    }
    if (type) filters.type = { $eq: type };

    const sessions: any[] = await strapi.entityService.findMany('api::event-session.event-session', {
      filters,
      populate: { product: { fields: ['id', 'name', 'slug'] } },
      fields: ['id', 'title', 'type', 'startDateTime', 'durationMinutes'],
      sort: { startDateTime: 'asc' },
    });

    const events = sessions.map((s) => {
      const start = new Date(s.startDateTime);
      const end = new Date(start.getTime() + Number(s.durationMinutes ?? 60) * 60 * 1000);
      const title = s.title || (s.type === 'workshop' ? 'Workshop' : 'Prehliadka');
      return {
        uid: `${s.id}@event-sessions`,
        title,
        start,
        end,
        description: s.product?.name ? `${title} – ${s.product.name}` : title,
        location: s.product?.name || '',
      };
    });

    const ics = buildIcs(events);
    ctx.set('Content-Type', 'text/calendar; charset=utf-8');
    ctx.set('Content-Disposition', `attachment; filename="product-${productId}-event-sessions.ics"`);
    ctx.body = ics;
  },
}));