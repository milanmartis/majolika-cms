function addMonths(d: Date, m: number) {
    const x = new Date(d);
    x.setMonth(x.getMonth() + m);
    return x;
  }
  
  export default {
    /** Po vytvorení série vygeneruj sessions v rozsahu [startDate, min(untilDate, startDate+6m)] */
    async afterCreate(event) {
      const id = event?.result?.id;
      if (!id) return;
  
      // načítaj sériu (potrebujeme start/until)
      const series = await strapi.entityService.findOne('api::event-series.event-series', id, {
        fields: ['startDate', 'untilDate'],
      });
  
      if (!series?.startDate) return;
  
      const start = new Date(series.startDate);
      // nepôjdeme pred startDate
      const end = series.untilDate
        ? new Date(series.untilDate + 'T23:59:59.999Z')
        : addMonths(start, 6);
  
      const svc = strapi.service('api::event-series.event-series') as any;
      await svc.generateSessionsForRange(id, start, end); // bez anchoru – nič pred startDate
    },
  
    /** Po zmene série bumpni verziu a pregeneruj budúce sessions od max(dnes, startDate) po min(untilDate, od+6m) */
    async afterUpdate(event) {
      const id = event?.result?.id;
      if (!id) return;
  
      const series = await strapi.entityService.findOne('api::event-series.event-series', id, {
        fields: ['startDate', 'untilDate', 'seriesVersion'],
      });
      if (!series?.startDate) return;
  
      const now = new Date();
      const startDate = new Date(series.startDate);
      const from = now > startDate ? now : startDate;
      const end = series.untilDate
        ? new Date(series.untilDate + 'T23:59:59.999Z')
        : addMonths(from, 6);
  
      // bumpni version (aby sa existujúce ne-detached termíny updatli)
      const nextVersion = (series.seriesVersion || 0) + 1;
      await strapi.entityService.update('api::event-series.event-series', id, {
        data: { seriesVersion: nextVersion },
      });
  
      const svc = strapi.service('api::event-series.event-series') as any;
      await svc.generateSessionsForRange(id, from, end); // iba od 'from', nikdy pred startDate
    },
  };
      