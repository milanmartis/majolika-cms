// src/api/event-session/content-types/event-session/lifecycles.ts
import { upsertGoogleEvent, deleteGoogleEvent } from '../../../../utils/googleCalendar';

type SessionEntity = {
  id: number;
  title?: string;
  type?: 'workshop' | 'tour';
  startDateTime?: string;
  durationMinutes?: number;
  maxCapacity?: number;
  googleEventId?: string | null; // <- lokálne doplnené
  bookings?: Array<{ id: number; status?: string; peopleCount?: number }>;
  product?: { id: number; name?: string; slug?: string };
};

export default {
  async afterCreate(event) {
    const id = event?.result?.id;
    if (!id) return;

    const entity = await strapi.entityService.findOne(
      'api::event-session.event-session',
      id,
      {
        // kým typy nevedia o googleEventId:
        fields: ['id','title','type','startDateTime','durationMinutes','maxCapacity','googleEventId'] as any,
        populate: {
          bookings: { fields: ['id','status','peopleCount','customerEmail','customerName'] as any },
          product:  { fields: ['id','name','slug'] as any },
        },
      }
    ) as unknown as SessionEntity;

    const googleId = await upsertGoogleEvent(entity);
    if (googleId && !entity.googleEventId) {
      await strapi.entityService.update(
        'api::event-session.event-session',
        id,
        {
          data: { googleEventId: googleId } as any,
        }
      );
    }
  },

  async afterUpdate(event) {
    const id = event?.result?.id;
    if (!id) return;

    const entity = await strapi.entityService.findOne(
      'api::event-session.event-session',
      id,
      {
        fields: ['id','title','type','startDateTime','durationMinutes','maxCapacity','googleEventId'] as any,
        populate: {
          bookings: { fields: ['id','status','peopleCount'] as any },
          product:  { fields: ['id','name','slug'] as any },
        },
      }
    ) as unknown as SessionEntity;

    const googleId = await upsertGoogleEvent(entity);
    if (googleId && !entity.googleEventId) {
      await strapi.entityService.update(
        'api::event-session.event-session',
        id,
        {
          data: { googleEventId: googleId } as any,
        }
      );
    }
  },

  async afterDelete(event) {
    const gId = (event?.result as SessionEntity | undefined)?.googleEventId;
    if (gId) await deleteGoogleEvent(gId);
  },
};
