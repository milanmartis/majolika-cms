// src/api/event-session/content-types/event-session/lifecycles.ts
import { upsertGoogleEvent, deleteGoogleEvent } from '../../../../utils/googleCalendar';

export default {
  async afterCreate(event) {
    const id = event?.result?.id;
    if (!id) return;

    const entity = await strapi.entityService.findOne('api::event-session.event-session', id, {
      populate: {
        bookings: { fields: ['id','status','peopleCount'] },
        product:  { fields: ['id','name','slug'] },
      },
      fields: ['id','title','type','startDateTime','durationMinutes','maxCapacity','googleEventId'],
      
    });

    const googleId = await upsertGoogleEvent(entity);
    if (googleId && !entity.googleEventId) {
      await strapi.entityService.update('api::event-session.event-session', id, { data: { googleEventId: googleId } });
    }
  },

  async afterUpdate(event) {
    const id = event?.result?.id;
    if (!id) return;

    const entity = await strapi.entityService.findOne('api::event-session.event-session', id, {
      populate: {
        bookings: { fields: ['id','status','peopleCount'] },
        product:  { fields: ['id','name','slug'] },
      },
      fields: ['id','title','type','startDateTime','durationMinutes','maxCapacity','googleEventId'],
    });

    const googleId = await upsertGoogleEvent(entity);
    if (googleId && !entity.googleEventId) {
      await strapi.entityService.update('api::event-session.event-session', id, { data: { googleEventId: googleId } });
    }
  },

  async afterDelete(event) {
    const old = event?.result;
    const gId = old?.googleEventId;
    if (gId) {
      await deleteGoogleEvent(gId);
    }
  },
};
