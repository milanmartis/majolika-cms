import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::event-session.event-session', ({ strapi }) => ({
  async listForDay(ctx) {
    const { date } = ctx.query;
    if (!date) {
      return ctx.badRequest('Missing date query param');
    }

    const d = new Date(String(date));
    if (isNaN(d.getTime())) {
      return ctx.badRequest('Invalid date');
    }

    // Interpretuj jako místní den (bez UTC posunu)
    const localDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const localDayEnd = new Date(localDayStart);
    localDayEnd.setDate(localDayEnd.getDate() + 1);

    strapi.log.debug(`Filtering sessions between ${localDayStart.toISOString()} and ${localDayEnd.toISOString()}`);

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
      sessions.map(async (s: any) => {
        const cap = await sessionService.getCapacity(s.id);
        return {
          ...s,
          capacity: cap,
        };
      })
    );

    ctx.body = withCapacity;
  },
}));
