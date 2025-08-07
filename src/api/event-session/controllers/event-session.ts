import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::event-session.event-session', ({ strapi }) => ({

  // Ping endpoint pre testovanie
  async ping(ctx) {
    strapi.log.debug('ping invoked');
    ctx.body = { ok: true, ts: new Date().toISOString() };
  },

  // Sessions podľa slug produktu
  async findByProductSlug(ctx) {
    const { slug } = ctx.query;
    if (typeof slug !== 'string') {
      ctx.status = 400;
      ctx.body = { error: 'Missing or invalid slug parameter' };
      return;
    }

    const sessions = await strapi.entityService.findMany('api::event-session.event-session', {
      filters: { product: { slug: { $eq: slug } } },
      fields: ['id', 'title', 'type', 'startDateTime', 'durationMinutes', 'maxCapacity'],
      populate: {
        product: {
          fields: ['id', 'name', 'slug', 'price', 'price_sale', 'inSale']
        }
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

  // Sessions pre konkrétny deň
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
      fields: ['id', 'title', 'type', 'startDateTime', 'durationMinutes', 'maxCapacity'],
      populate: { product: { fields: ['name', 'slug'] } },
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

  // Sessions pre rozsah dátumov
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
      fields: ['id', 'title', 'type', 'startDateTime', 'durationMinutes', 'maxCapacity'],
      populate: { product: { fields: ['name', 'slug'] } },
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
  }
}));
