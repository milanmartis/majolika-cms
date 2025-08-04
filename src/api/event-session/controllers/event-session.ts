import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::event-session.event-session', ({ strapi }) => ({

  async ping(ctx) {
    strapi.log.debug('ping invoked');
    return ctx.send({ ok: true, ts: new Date().toISOString() });
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
      fields: ['id', 'title', 'type', 'startDateTime', 'durationMinutes', 'maxCapacity'],
      populate: {
        product: { fields: ['id', 'name', 'slug'] },
      },
      sort: { startDateTime: 'asc' },
    });

    const sessionService = strapi.service('api::event-session.event-session');
    const withCapacity = await Promise.all(
      sessions.map(async (s) => {
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

    // Od 0:00 do 23:59 dňa
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
      populate: {
        product: { fields: ['name', 'slug'] },
      },
      sort: { startDateTime: 'asc' },
    });

    const sessionService = strapi.service('api::event-session.event-session');
    const withCapacity = await Promise.all(
      sessions.map(async (s) => {
        const cap = await sessionService.getCapacity(s.id);
        return { ...s, capacity: cap };
      })
    );

    ctx.body = withCapacity;
  },

  // NOVÝ ENDPOINT /by-range
  async byRange(ctx) {
    const { start, end } = ctx.query;
    if (!start || !end) return ctx.badRequest('Missing start or end parameter');

    const startDate = new Date(String(start));
    const endDate = new Date(String(end));
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return ctx.badRequest('Invalid date');

    const sessions = await strapi.entityService.findMany('api::event-session.event-session', {
      filters: {
        startDateTime: {
          $gte: startDate.toISOString(),
          $lt: endDate.toISOString(),
        },
      },
      fields: ['id', 'title', 'type', 'startDateTime', 'durationMinutes', 'maxCapacity'],
      populate: {
        product: { fields: ['name', 'slug'] },
      },
      sort: { startDateTime: 'asc' },
    });

    const sessionService = strapi.service('api::event-session.event-session');
    const withCapacity = await Promise.all(
      sessions.map(async (s) => {
        const cap = await sessionService.getCapacity(s.id);
        return { ...s, capacity: cap };
      })
    );

    ctx.body = withCapacity;
  },
}));
