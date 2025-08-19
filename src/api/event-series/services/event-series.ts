import { factories } from '@strapi/strapi';
import { RRule, RRuleSet, Weekday } from 'rrule';
import type { Options as RRuleOptions } from 'rrule';

type WeekdayStr = 'MO'|'TU'|'WE'|'TH'|'FR'|'SA'|'SU';

function mapWeekday(w: WeekdayStr): Weekday {
  const map: Record<WeekdayStr, Weekday> = {
    MO: RRule.MO, TU: RRule.TU, WE: RRule.WE, TH: RRule.TH,
    FR: RRule.FR, SA: RRule.SA, SU: RRule.SU,
  };
  return map[w];
}

function isArr(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

export default factories.createCoreService('api::event-series.event-series', ({ strapi }) => ({

  buildRRule(series: any): RRule {
    const [h, m, s] = String(series.timeOfDay || '15:00:00').split(':').map(Number);
    const start = new Date(series.startDate);
    start.setHours(h || 0, m || 0, s || 0, 0);

    const options: Partial<RRuleOptions> = {
      dtstart: start,
      freq: series.frequency === 'DAILY'
        ? RRule.DAILY
        : series.frequency === 'MONTHLY'
          ? RRule.MONTHLY
          : RRule.WEEKLY,
      interval: series.interval || 1,
      count: series.count || undefined,
      until: series.untilDate ? new Date(series.untilDate + 'T23:59:59.999Z') : undefined,
    };

    if (isArr(series.byWeekday) && options.freq === RRule.WEEKLY) {
      options.byweekday = (series.byWeekday as WeekdayStr[]).map(mapWeekday);
    }
    if (isArr(series.byMonthDay) && options.freq === RRule.MONTHLY) {
      options.bymonthday = series.byMonthDay as number[];
    }

    return new RRule(options as RRuleOptions);
  },

  async generateSessionsForRange(seriesId: number, rangeStart: Date, rangeEnd: Date) {
    const series = await strapi.entityService.findOne('api::event-series.event-series', seriesId, {
      fields: [
        'id','title','type','timezone','startDate','timeOfDay','untilDate','count',
        'frequency','interval','byWeekday','byMonthDay','durationMinutes',
        'maxCapacity','seriesVersion','exDates'
      ],
      populate: { product: { fields: ['id'] } }
    });
    if (!series) throw new Error('Series not found');

    const rr = this.buildRRule(series);
    const allDates = rr.between(rangeStart, rangeEnd, true);

    const exArr: string[] = isArr(series.exDates) ? (series.exDates as unknown[]).map(String) : [];
    const exSet = new Set<string>(exArr.map((d) => new Date(d).toISOString().slice(0, 10)));
    const occurrences = allDates.filter((d) => !exSet.has(d.toISOString().slice(0, 10)));

    // produkt musí byť, lebo v event-session je required
    const productId: number | undefined = (series as any)?.product?.id ?? undefined;
    if (!productId) {
      throw new Error('Series has no product, but event-session.product is required.');
    }

    for (const dt of occurrences) {
      const startDateTime = new Date(dt);

      const existing = await strapi.entityService.findMany('api::event-session.event-session', {
        filters: {
          series: { id: { $eq: series.id } },
          isDetachedFromSeries: { $eq: false },
          startDateTime: { $eq: startDateTime.toISOString() },
        },
        fields: ['id','seriesVersion'],
      });

      if (existing.length) {
        const sess = existing[0];
        if (sess.seriesVersion !== series.seriesVersion) {
          await strapi.entityService.update('api::event-session.event-session', sess.id, {
            data: {
              title: series.title,
              type: series.type,
              durationMinutes: series.durationMinutes,
              maxCapacity: series.maxCapacity,
              seriesVersion: series.seriesVersion,
              product: productId,
            },
          });
        }
      } else {
        await strapi.entityService.create('api::event-session.event-session', {
          data: {
            title: series.title,
            type: series.type,
            startDateTime: startDateTime.toISOString(),
            durationMinutes: series.durationMinutes,
            maxCapacity: series.maxCapacity,
            product: productId,                    // REQUIRED → už nie je optional
            series: series.id,
            seriesVersion: series.seriesVersion,
            isDetachedFromSeries: false,
          },
        });
      }
    }

    return { createdOrUpdated: occurrences.length };
  },

  async bumpAndRegenerate(seriesId: number, fromISO?: string) {
    const current = await strapi.entityService.findOne('api::event-series.event-series', seriesId, {
      fields: ['id','seriesVersion'],
    });
    if (!current) throw new Error('Series not found');

    const nextVersion = (current.seriesVersion || 0) + 1;
    await strapi.entityService.update('api::event-series.event-series', seriesId, {
      data: { seriesVersion: nextVersion },
    });

    const start = fromISO ? new Date(fromISO) : new Date();
    const end = new Date(); end.setMonth(end.getMonth() + 6);
    return this.generateSessionsForRange(seriesId, start, end);
  },

  async detachSession(sessionId: number) {
    return strapi.entityService.update('api::event-session.event-session', sessionId, {
      data: { isDetachedFromSeries: true },
    });
  },

  async bulkPatchFutureSessions(seriesId: number, patch: Record<string, any>, fromISO?: string) {
    const from = fromISO ? new Date(fromISO).toISOString() : new Date().toISOString();
    const series = await strapi.entityService.findOne('api::event-series.event-series', seriesId, {
      fields: ['id','seriesVersion'],
    });
    if (!series) throw new Error('Series not found');

    const sessions = await strapi.entityService.findMany('api::event-session.event-session', {
      filters: {
        series: { id: { $eq: seriesId } },
        isDetachedFromSeries: { $eq: false },
        seriesVersion: { $eq: series.seriesVersion },
        startDateTime: { $gte: from },
      },
      fields: ['id'],
    });

    for (const s of sessions) {
      await strapi.entityService.update('api::event-session.event-session', s.id, { data: patch });
    }
    return { updated: sessions.length };
  },

}));
