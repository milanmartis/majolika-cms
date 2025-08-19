import { factories } from '@strapi/strapi';

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

export default factories.createCoreController('api::event-session.event-session', ({ strapi }) => ({

  // --- tvoje metódy (ponechané) ---

  async ping(ctx) {
    strapi.log.debug('ping invoked');
    ctx.body = { ok: true, ts: new Date().toISOString() };
  },

  async findByProductSlug(ctx) {
    const { slug } = ctx.query;
    if (typeof slug !== 'string') {
      ctx.status = 400;
      ctx.body = { error: 'Missing or invalid slug parameter' };
      return;
    }

    const sessions = await strapi.entityService.findMany('api::event-session.event-session', {
      filters: { product: { slug: { $eq: slug } } },
      fields: ['id','title','type','startDateTime','durationMinutes','maxCapacity'],
      populate: {
        product: { fields: ['id','name','slug','price','price_sale','inSale'] },
        series:  { fields: ['id','title','seriesVersion','frequency','interval','byWeekday','timeOfDay'] }
      },
      sort: { startDateTime: 'asc' },
    });

    const sessionService = strapi.service('api::event-session.event-session');
    const withCapacity = await Promise.all(
      sessions.map(async (s: any) => {
        const cap = await sessionService.getCapacity(s.id);
        return { ...s, capacity: cap };
      })
    );

    ctx.body = { data: withCapacity };
  },

  async listForDay(ctx) {
    const { date } = ctx.query;
    if (!date) return ctx.badRequest('Missing date query param');

    const d = new Date(String(date));
    if (isNaN(d.getTime())) return ctx.badRequest('Invalid date');

    const localDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const localDayEnd = new Date(localDayStart);
    localDayEnd.setDate(localDayEnd.getDate() + 1);

    strapi.log.debug(`listForDay invoked, filtering sessions between ${localDayStart.toISOString()} and ${localDayEnd.toISOString()}`);

    const sessions = await strapi.entityService.findMany('api::event-session.event-session', {
      filters: {
        startDateTime: {
          $gte: localDayStart.toISOString(),
          $lt: localDayEnd.toISOString(),
        },
      },
      fields: ['id','title','type','startDateTime','durationMinutes','maxCapacity'],
      populate: {
        product: { fields: ['id','name','slug','price','price_sale','inSale'] },
        series:  { fields: ['id','title','seriesVersion','frequency','interval','byWeekday','timeOfDay'] }
      },
      sort: { startDateTime: 'asc' },
    });

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
    if (!start || !end) return ctx.badRequest('Missing start or end query param');

    const startDate = new Date(String(start));
    const endDate = new Date(String(end));
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return ctx.badRequest('Invalid date range');
    }
    const rangeEnd = new Date(endDate);
    rangeEnd.setHours(23, 59, 59, 999);

    const sessions = await strapi.entityService.findMany('api::event-session.event-session', {
      filters: {
        startDateTime: {
          $gte: startDate.toISOString(),
          $lte: rangeEnd.toISOString(),
        },
      },
      fields: ['id','title','type','startDateTime','durationMinutes','maxCapacity'],
      populate: {
        product: { fields: ['id','name','slug','price','price_sale','inSale'] },
        series:  { fields: ['id','title','seriesVersion','frequency','interval','byWeekday','timeOfDay'] }
      },
      sort: { startDateTime: 'asc' },
    });

    const sessionService = strapi.service('api::event-session.event-session');
    const withCapacity = await Promise.all(
      sessions.map(async (s: any) => {
        const cap = await sessionService.getCapacity(s.id);
        return { ...s, capacity: cap };
      })
    );

    strapi.log.debug('by-range result', JSON.stringify(withCapacity));
    ctx.body = { data: withCapacity };
  },

  // --- doplnené .ics endpointy ---

  /** GET /event-sessions/:id/ics */
  async icsOne(ctx) {
    const id = Number(ctx.params.id);
    const s: any = await strapi.entityService.findOne('api::event-session.event-session', id, {
      populate: { product: { fields: ['id','name','slug'] } },
      fields: ['id','title','type','startDateTime','durationMinutes'],
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
      populate: { product: { fields: ['id','name','slug'] } },
      fields: ['id','title','type','startDateTime','durationMinutes'],
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
      if (to)   filters.startDateTime.$lte = new Date(String(to)).toISOString();
    }
    if (type) filters.type = { $eq: type };
  
    // podpora product id aj slug naraz
    const productFilter: any = {};
    if (product) productFilter.id = { $eq: Number(product) };
    if (slug)    productFilter.slug = { $eq: slug };
    if (Object.keys(productFilter).length) filters.product = productFilter;
  
    const sessions = await strapi.entityService.findMany('api::event-session.event-session', {
      filters,
      fields: ['id','title','type','startDateTime','durationMinutes','maxCapacity'],
      populate: {
        bookings: { fields: ['id','status'] },
        product:  { fields: ['id','name','slug'] },
      },
      sort: { startDateTime: 'asc' },
    });
  
    const items = (sessions as any[]).map((s) => {
      const start = new Date(s.startDateTime);
      const dur   = Number(s.durationMinutes ?? 60);
      const end   = new Date(start.getTime() + dur * 60000);
  
      const confirmedCount = Array.isArray(s.bookings)
        ? s.bookings.filter((b: any) => (b?.status ? ['paid','confirmed'].includes(b.status) : true)).length
        : 0;
  
      const available = Math.max(0, Number(s.maxCapacity) - confirmedCount);
  
      return {
        id: s.id,
        title: s.title ?? (s.type === 'workshop' ? 'Workshop' : 'Prehliadka'),
        type: s.type,
        start: start.toISOString(),
        end: end.toISOString(),
        durationMinutes: dur,
        maxCapacity: s.maxCapacity,
        confirmedCount,
        available,
        product: s.product ? { id: s.product.id, title: s.product.name, slug: s.product.slug } : null,
      };
    });
  
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
      populate: { product: { fields: ['id','name','slug'] } },
      fields: ['id','title','type','startDateTime','durationMinutes'],
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
