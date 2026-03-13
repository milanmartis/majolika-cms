import { factories } from '@strapi/strapi';
import { RRule, Weekday } from 'rrule';
import type { Options as RRuleOptions } from 'rrule';
import { DateTime } from 'luxon';

type WeekdayStr = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

function mapWeekday(w: WeekdayStr): Weekday {
  const map: Record<WeekdayStr, Weekday> = {
    MO: RRule.MO,
    TU: RRule.TU,
    WE: RRule.WE,
    TH: RRule.TH,
    FR: RRule.FR,
    SA: RRule.SA,
    SU: RRule.SU,
  };
  return map[w];
}

function isArr(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

export default factories.createCoreService('api::event-series.event-series', ({ strapi }) => ({
  getZone(series: any): string {
    return series.timezone || 'Europe/Bratislava';
  },

  /**
   * RRULE staviame nad "calendar date anchor", nie nad UTC časom.
   * Čas dňa sa doplní až pri vytváraní konkrétneho výskytu.
   */
  buildRRule(series: any): RRule {
    const zone = this.getZone(series);

    const startLocal = DateTime.fromISO(String(series.startDate), { zone }).startOf('day');

    const options: Partial<RRuleOptions> = {
      dtstart: startLocal.toJSDate(),
      freq:
        series.frequency === 'DAILY'
          ? RRule.DAILY
          : series.frequency === 'MONTHLY'
            ? RRule.MONTHLY
            : RRule.WEEKLY,
      interval: series.interval || 1,
      count: series.count || undefined,
      until: series.untilDate
        ? DateTime.fromISO(String(series.untilDate), { zone }).endOf('day').toJSDate()
        : undefined,
    };

    if (isArr(series.byWeekday) && options.freq === RRule.WEEKLY) {
      options.byweekday = (series.byWeekday as WeekdayStr[]).map(mapWeekday);
    }

    if (isArr(series.byMonthDay) && options.freq === RRule.MONTHLY) {
      options.bymonthday = series.byMonthDay as number[];
    }

    return new RRule(options as RRuleOptions);
  },

  /**
   * Z výskytu RRULE zoberie LEN lokálny dátum a nalepí timeOfDay
   * v správnej zóne. Potom prevedie na UTC ISO.
   */
  occurrenceToUtcIso(series: any, occurrence: Date): string {
    const zone = this.getZone(series);
    const [h, m, s] = String(series.timeOfDay || '15:00:00').split(':').map(Number);

    const occDay = DateTime.fromJSDate(occurrence, { zone });

    const localDateTime = DateTime.fromObject(
      {
        year: occDay.year,
        month: occDay.month,
        day: occDay.day,
        hour: h || 0,
        minute: m || 0,
        second: s || 0,
        millisecond: 0,
      },
      { zone }
    );

    return localDateTime.toUTC().toISO()!;
  },

  async generateSessionsForRange(seriesId: number, rangeStart: Date, rangeEnd: Date) {
    const series = await strapi.entityService.findOne('api::event-series.event-series', seriesId, {
      fields: [
        'id',
        'title',
        'type',
        'timezone',
        'startDate',
        'timeOfDay',
        'untilDate',
        'count',
        'frequency',
        'interval',
        'byWeekday',
        'byMonthDay',
        'durationMinutes',
        'maxCapacity',
        'seriesVersion',
        'exDates',
      ],
      populate: { product: { fields: ['id'] } },
    });

    if (!series) throw new Error('Series not found');

    const zone = this.getZone(series);

    const rr = this.buildRRule(series);

    const rangeStartLocal = DateTime.fromJSDate(rangeStart, { zone }).startOf('day').toJSDate();
    const rangeEndLocal = DateTime.fromJSDate(rangeEnd, { zone }).endOf('day').toJSDate();

    const allDates = rr.between(rangeStartLocal, rangeEndLocal, true);

    const exArr: string[] = isArr(series.exDates) ? (series.exDates as unknown[]).map(String) : [];
    const exSet = new Set(
      exArr.map((d) => DateTime.fromISO(d, { zone }).toISODate())
    );

    const occurrences = allDates.filter((d) => {
      const dayKey = DateTime.fromJSDate(d, { zone }).toISODate();
      return !exSet.has(dayKey);
    });

    const occurrenceIsos = occurrences.map((d) => this.occurrenceToUtcIso(series, d));
    const keepIsoSet = new Set(occurrenceIsos);

    const productId: number | undefined = (series as any)?.product?.id ?? undefined;

    const existing = await strapi.entityService.findMany('api::event-session.event-session', {
      filters: {
        isDetachedFromSeries: { $eq: false },
        startDateTime: { $gte: rangeStart.toISOString(), $lte: rangeEnd.toISOString() },
        $or: [
          { series: { id: { $eq: series.id } } },
          { series: { $null: true } },
        ],
      },
      populate: { series: { fields: ['id'] } },
      fields: ['id', 'startDateTime', 'seriesVersion'],
      sort: { startDateTime: 'asc' },
    });

    const existMap = new Map<string, { id: number; seriesId?: number; seriesVersion?: number }>();
    for (const e of existing as any[]) {
      const key = new Date(e.startDateTime).toISOString();
      existMap.set(key, {
        id: e.id,
        seriesId: e.series?.id,
        seriesVersion: e.seriesVersion ?? 0,
      });
    }

    const touchedDates: string[] = [];
    let changed = 0;

    for (const iso of occurrenceIsos) {
      const hit = existMap.get(iso);

      if (hit) {
        const needsAttach = !hit.seriesId;
        const needsVersionBump = (hit.seriesVersion ?? 0) !== series.seriesVersion;

        if (needsAttach || needsVersionBump) {
          const data: any = {
            title: series.title,
            type: series.type,
            durationMinutes: series.durationMinutes,
            maxCapacity: series.maxCapacity,
            series: series.id,
            seriesVersion: series.seriesVersion,
          };
          if (productId) data.product = productId;

          await strapi.entityService.update('api::event-session.event-session', hit.id, { data });
          changed++;
          touchedDates.push(iso);
        }
        continue;
      }

      const data: any = {
        title: series.title,
        type: series.type,
        startDateTime: iso,
        durationMinutes: series.durationMinutes,
        maxCapacity: series.maxCapacity,
        series: series.id,
        seriesVersion: series.seriesVersion,
        isDetachedFromSeries: false,
      };
      if (productId) data.product = productId;

      await strapi.entityService.create('api::event-session.event-session', { data });
      changed++;
      touchedDates.push(iso);
    }

    return { createdOrUpdated: changed, dates: touchedDates };
  },

  async bumpAndRegenerate(seriesId: number, fromISO?: string) {
    const current = await strapi.entityService.findOne('api::event-series.event-series', seriesId, {
      fields: ['id', 'seriesVersion', 'startDate', 'untilDate'],
    });
    if (!current) throw new Error('Series not found');

    const nextVersion = (current.seriesVersion || 0) + 1;

    await strapi.entityService.update('api::event-series.event-series', seriesId, {
      data: { seriesVersion: nextVersion },
    });

    const now = new Date();
    const startDate = current.startDate ? new Date(current.startDate) : now;
    const from = fromISO ? new Date(fromISO) : now;
    const rangeStart = from > startDate ? from : startDate;

    const rangeEnd = current.untilDate
      ? new Date(current.untilDate + 'T23:59:59.999Z')
      : (() => {
          const d = new Date(rangeStart);
          d.setMonth(d.getMonth() + 6);
          return d;
        })();

    return this.generateSessionsForRange(seriesId, rangeStart, rangeEnd);
  },

  async detachSession(sessionId: number) {
    return strapi.entityService.update('api::event-session.event-session', sessionId, {
      data: { isDetachedFromSeries: true },
    });
  },

  async bulkPatchFutureSessions(seriesId: number, patch: Record<string, any>, fromISO?: string) {
    const from = fromISO ? new Date(fromISO).toISOString() : new Date().toISOString();

    const series = await strapi.entityService.findOne('api::event-series.event-series', seriesId, {
      fields: ['id', 'seriesVersion'],
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

    for (const s of sessions as any[]) {
      await strapi.entityService.update('api::event-session.event-session', s.id, { data: patch });
    }

    return { updated: (sessions as any[]).length };
  },

  async pruneFutureSessions(
    seriesId: number,
    rangeStart: Date,
    rangeEnd: Date,
    keepISOs: string[],
    opts: {
      protectWithBookings?: boolean;
      autoDetachProtected?: boolean;
      bookingWhere?: any;
    } = { protectWithBookings: true, autoDetachProtected: true }
  ) {
    const keep = new Set(keepISOs.map((d) => new Date(d).toISOString()));

    const candidates = await strapi.entityService.findMany('api::event-session.event-session', {
      filters: {
        series: { id: { $eq: seriesId } },
        isDetachedFromSeries: { $eq: false },
        startDateTime: { $gte: rangeStart.toISOString(), $lte: rangeEnd.toISOString() },
      },
      fields: ['id', 'startDateTime'],
    });

    let removed = 0;
    let protectedCnt = 0;
    let detachedCnt = 0;

    for (const s of candidates as any[]) {
      const iso = new Date(s.startDateTime).toISOString();
      if (keep.has(iso)) continue;

      if (opts.protectWithBookings) {
        const activeCount = await strapi.db.query('api::event-booking.event-booking').count({
          where: {
            session: s.id,
            ...(opts.bookingWhere ?? { status: { $in: ['pending', 'paid', 'confirmed'] } }),
          },
        });

        if (activeCount > 0) {
          protectedCnt++;
          if (opts.autoDetachProtected) {
            await strapi.entityService.update('api::event-session.event-session', s.id, {
              data: { isDetachedFromSeries: true },
            });
            detachedCnt++;
          }
          continue;
        }
      }

      await strapi.entityService.delete('api::event-session.event-session', s.id);
      removed++;
    }

    return {
      scanned: (candidates as any[]).length,
      removed,
      protected: protectedCnt,
      autoDetached: detachedCnt,
    };
  },
}));
