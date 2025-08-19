import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::event-series.event-series', ({ strapi }) => ({

  async generate(ctx) {
    const id = Number(ctx.params.id);
    const { start, end } = ctx.request.query as { start?: string; end?: string; };

    const rangeStart = start ? new Date(start) : new Date();
    const rangeEnd = end ? new Date(end) : (() => { const d = new Date(); d.setMonth(d.getMonth()+6); return d; })();

    const svc = strapi.service('api::event-series.event-series') as any;
    const out = await svc.generateSessionsForRange(id, rangeStart, rangeEnd);
    ctx.body = out;
  },

  async bumpAndRegenerate(ctx) {
    const id = Number(ctx.params.id);
    const { from } = ctx.request.query as { from?: string };
    const svc = strapi.service('api::event-series.event-series') as any;
    const out = await svc.bumpAndRegenerate(id, from);
    ctx.body = out;
  },

  async bulkPatchFutureSessions(ctx) {
    const id = Number(ctx.params.id);
    const { from } = ctx.request.query as { from?: string };
    const patch = ctx.request.body || {};
    const svc = strapi.service('api::event-series.event-series') as any;
    const out = await svc.bulkPatchFutureSessions(id, patch, from);
    ctx.body = out;
  },

  async detachSession(ctx) {
    const { sessionId } = ctx.params;
    const svc = strapi.service('api::event-series.event-series') as any;
    const out = await svc.detachSession(Number(sessionId));
    ctx.body = out;
  },

}));
