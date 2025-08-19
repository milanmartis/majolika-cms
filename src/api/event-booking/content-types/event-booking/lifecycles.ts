/* eslint-disable @typescript-eslint/no-explicit-any */
import { errors } from '@strapi/utils';

// Strapi v lifecycles má global `strapi`; pre TS ho deklarujeme:
declare const strapi: any;

const { ApplicationError } = errors as any;

function extractSessionId(data: any): number | undefined {
  if (!data) return undefined;
  if (typeof data.session === 'number') return data.session;
  if (typeof data.session?.id === 'number') return data.session.id;

  // prípady pri update/connect
  const conn = data.session?.connect;
  if (Array.isArray(conn) && conn[0]?.id) return Number(conn[0].id);
  if (conn?.id) return Number(conn.id);
  return undefined;
}

async function getSessionMaxCapacity(sessionId: number): Promise<number> {
  const session = await strapi.entityService.findOne('api::event-session.event-session', sessionId, {
    fields: ['id', 'maxCapacity'],
  });
  if (!session) throw new ApplicationError('Event session not found');
  return Number((session as any).maxCapacity ?? 0);
}

// ❗ Kľúčový fix: žiadne generické typy pre getModel; odtypujeme na any
function hasStatusField(): boolean {
  const model = (strapi as any).getModel('api::event-booking.event-booking') as any;
  return Boolean(model?.attributes?.status);
}

function countsTowardCapacity(data: any): boolean {
  // ak model nemá status, rátame všetko
  if (!hasStatusField()) return true;
  const st = data?.status;
  return ['paid', 'confirmed'].includes(st);
}

async function countExisting(sessionId: number, excludeId?: number): Promise<number> {
  const filters: any = { session: { id: { $eq: sessionId } } };
  if (excludeId) filters.id = { $ne: excludeId };
  if (hasStatusField()) filters.status = { $in: ['paid', 'confirmed'] };

  const list = await strapi.entityService.findMany('api::event-booking.event-booking', {
    filters,
    fields: ['id'],
    limit: 10000,
  });
  return (list as any[]).length;
}

export default {
  /** Overbooking guard pred vytvorením */
  async beforeCreate(event: any) {
    const data = event.params?.data || {};
    const sessionId = extractSessionId(data);
    if (!sessionId) return;

    if (!countsTowardCapacity(data)) return;

    const [maxCap, current] = await Promise.all([
      getSessionMaxCapacity(sessionId),
      countExisting(sessionId),
    ]);

    if (current + 1 > maxCap) {
      throw new ApplicationError('Kapacita tohto termínu je už naplnená.');
    }
  },

  /** Overbooking guard pred update */
  async beforeUpdate(event: any) {
    const id = Number(event.params?.where?.id);
    if (!id) return;

    const existing = await strapi.entityService.findOne('api::event-booking.event-booking', id, {
      fields: ['id', 'status'],
      populate: { session: { fields: ['id'] } },
    }) as any;

    const data = event.params?.data || {};

    // urči sessionId (nové z payloadu alebo pôvodné)
    let sessionId = extractSessionId(data);
    if (!sessionId) sessionId = existing?.session?.id;
    if (!sessionId) return;

    const wasCounted = hasStatusField() ? ['paid', 'confirmed'].includes(existing?.status) : true;
    const willBeCounted = countsTowardCapacity({ ...existing, ...data });

    // ak sa po update nebude započítavať → OK
    if (!willBeCounted) return;

    const [maxCap, currentOthers] = await Promise.all([
      getSessionMaxCapacity(sessionId),
      countExisting(sessionId, id),
    ]);

    if (currentOthers + 1 > maxCap) {
      throw new ApplicationError('Kapacita tohto termínu je už naplnená.');
    }
  },
};
