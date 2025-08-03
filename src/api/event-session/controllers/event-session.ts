import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::event-session.event-session', ({ strapi }) => ({

  // Príklad test endpointu
  async ping(ctx) {
    strapi.log.debug('ping invoked');
    return ctx.send({ ok: true, ts: new Date().toISOString() });
  },


  async findByProductId(ctx) {
    const { product_id } = ctx.query;
    if (!product_id) {
      ctx.status = 400;
      ctx.body = { error: 'Missing product_id parameter' };
      return;
    }
  
    // ID musí byť číslo
    const pid = parseInt(product_id as string, 10);
    if (isNaN(pid)) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid product_id parameter' };
      return;
    }
  
    // STRAPI V5: Filter manyToOne cez id!
    const sessions = await strapi.entityService.findMany('api::event-session.event-session', {
      filters: {
        product: { id: { $eq: pid } }, // <-- TOTO je správny zápis pre v5
      },
      populate: {
        product: { fields: ['id', 'name', 'slug'] },
      },
    });
  
    ctx.body = { data: sessions };
  },
  

  // Vráti sessions pre konkrétny deň aj s kapacitou
  async listForDay(ctx) {
    const { date } = ctx.query;
    if (!date) return ctx.badRequest('Missing date query param');

    const d = new Date(String(date));
    if (isNaN(d.getTime())) return ctx.badRequest('Invalid date');

    // Od 0:00 do 23:59
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

    // Dynamicky pridaj kapacitu
    const sessionService = strapi.service('api::event-session.event-session');
    const withCapacity = await Promise.all(
      sessions.map(async (s: any) => {
        const cap = await sessionService.getCapacity(s.id);
        return { ...s, capacity: cap };
      })
    );

    ctx.body = withCapacity;
  },
}));
