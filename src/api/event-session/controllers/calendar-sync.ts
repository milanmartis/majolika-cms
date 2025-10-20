import { factories } from '@strapi/strapi';
import { upsertGoogleEvent } from '../../../utils/googleCalendar';

export default factories.createCoreController('api::event-session.event-session', ({ strapi }) => ({
  // GET /event-sessions/sync-to-gcal?from=2025-01-01&to=2025-12-31
  async syncToGcal(ctx) {
    if (process.env.GCAL_SYNC_ENABLED !== 'true') {
      ctx.status = 503;
      ctx.body = { error: 'GCAL_SYNC_ENABLED is not true' };
      return;
    }

    const q = ctx.query as Record<string, string | undefined>;
    const from = q.from ? new Date(q.from) : new Date();                 // default: od dnes
    const to   = q.to   ? new Date(q.to)   : new Date(Date.now() + 180*24*3600*1000); // default: +6 mesiacov

    const sessions = await strapi.entityService.findMany('api::event-session.event-session', {
      filters: { startDateTime: { $gte: from.toISOString(), $lte: to.toISOString() } },
      fields: ['id','title','type','startDateTime','durationMinutes','maxCapacity','googleEventId'] as any,
      populate: {
        bookings: { fields: ['id','status','peopleCount','customerEmail','customerName'] as any },
        product:  { fields: ['id','name','slug'] as any },
      },
      sort: { startDateTime: 'asc' },
      limit: 1000,
    });

    const results: Array<{id:number; googleId:string|null; updated:boolean}> = [];
    for (const s of sessions as any[]) {
      const googleId = await upsertGoogleEvent(s);
      if (googleId && !s.googleEventId) {
        await strapi.entityService.update('api::event-session.event-session', s.id, { data: { googleEventId: googleId } as any });
      }
      results.push({ id: s.id, googleId: googleId ?? s.googleEventId ?? null, updated: true });
    }

    ctx.body = { count: results.length, items: results };
  },
}));
