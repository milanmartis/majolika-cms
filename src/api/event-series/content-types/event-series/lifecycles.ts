function addMonths(d: Date, m: number) {
    const x = new Date(d);
    x.setMonth(x.getMonth() + m);
    return x;
  }
  
  export default {
    /**
     * ZVÝŠ VERZIU PRED UPDATE (bez ďalšieho update-u v afterUpdate)
     */
    async beforeUpdate(event) {
      try {
        const id =
          event?.params?.where?.id ??
          event?.params?.data?.id ??
          event?.result?.id;
  
        if (!id) return;
  
        // načítaj aktuálnu verziu a nastav +1 do práve prebiehajúceho update-u
        const current = await strapi.entityService.findOne('api::event-series.event-series', id, {
          fields: ['seriesVersion'],
        });
        const nextVersion = ((current?.seriesVersion as number) || 0) + 1;
  
        event.params.data = {
          ...(event.params.data || {}),
          seriesVersion: nextVersion,
        };
      } catch (err) {
        strapi.log.error('[series beforeUpdate] failed to bump version', err);
      }
    },
  
    /**
     * Po CREATE: nespomaľuj save, spusti generate na pozadí od startDate na 6m (alebo do untilDate)
     */
    async afterCreate(event) {
      const id = event?.result?.id;
      if (!id) return;
  
      try {
        const series = await strapi.entityService.findOne('api::event-series.event-series', id, {
          fields: ['startDate', 'untilDate'],
        });
        if (!series?.startDate) return;
  
        const start = new Date(series.startDate);
        const end = series.untilDate
          ? new Date(series.untilDate + 'T23:59:59.999Z')
          : addMonths(start, 6);
  
        const svc = strapi.service('api::event-series.event-series') as any;
  
        // fire-and-forget (neblokuje uloženie)
        setImmediate(() => {
          svc.generateSessionsForRange(id, start, end)
            .then((res: any) => strapi.log.info(`[series ${id}] generated ${res.createdOrUpdated}`))
            .catch((err: any) => strapi.log.error(`[series ${id}] generate failed`, err));
        });
      } catch (err) {
        strapi.log.error('[series afterCreate] schedule generate failed', err);
      }
    },
  
    /**
     * Po UPDATE: už neupdate-uj verziu (spravili sme v beforeUpdate),
     * iba pregeneruj budúce termíny od max(now, startDate) na 6m (alebo do untilDate).
     */
    async afterUpdate(event) {
      const id = event?.result?.id;
      if (!id) return;
  
      try {
        const series = await strapi.entityService.findOne('api::event-series.event-series', id, {
          fields: ['startDate', 'untilDate'],
        });
        if (!series?.startDate) return;
  
        const now = new Date();
        const startDate = new Date(series.startDate);
        const from = now > startDate ? now : startDate;
  
        const end = series.untilDate
          ? new Date(series.untilDate + 'T23:59:59.999Z')
          : addMonths(from, 6);
  
        const svc = strapi.service('api::event-series.event-series') as any;
  
        // fire-and-forget (neblokuje uloženie)
        setImmediate(() => {
          svc.generateSessionsForRange(id, from, end)
            .then((res: any) => strapi.log.info(`[series ${id}] regen ${res.createdOrUpdated}`))
            .catch((err: any) => strapi.log.error(`[series ${id}] regen failed`, err));
        });
      } catch (err) {
        strapi.log.error('[series afterUpdate] schedule regen failed', err);
      }
    },
  };
  