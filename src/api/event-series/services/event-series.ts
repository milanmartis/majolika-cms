// src/api/event-series/services/event-series.ts
import { factories } from '@strapi/strapi';
import { RRule, Weekday } from 'rrule';
import type { Options as RRuleOptions } from 'rrule';

type WeekdayStr = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

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

  /**
   * Postaví RRULE podľa série. DTSTART sa skladá zo series.startDate + timeOfDay.
   * (Bez "backfillu" pred startDate.)
   */
  buildRRule(series: any): RRule {
    const [h, m, s] = String(series.timeOfDay || '15:00:00').split(':').map(Number);

    const start = new Date(series.startDate);
    start.setHours(h || 0, m || 0, s || 0, 0);

    const options: Partial<RRuleOptions> = {
      dtstart: start,
      freq:
        series.frequency === 'DAILY'
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

  /**
   * Expanduje výskyty v zadanom rozsahu a urobí CREATE/UPDATE bez duplikátov.
   * - Existujúce nedetached sessions v rozsahu sa načítajú naraz (výkon).
   * - Ak session existuje bez series, pripojí sa k sérii.
   * - Odpojené (isDetachedFromSeries=true) sa nikdy neprepisujú.
   */
  async generateSessionsForRange(seriesId: number, rangeStart: Date, rangeEnd: Date) {
    const series = await strapi.entityService.findOne('api::event-series.event-series', seriesId, {
      fields: [
        'id', 'title', 'type', 'timezone', 'startDate', 'timeOfDay', 'untilDate', 'count',
        'frequency', 'interval', 'byWeekday', 'byMonthDay', 'durationMinutes',
        'maxCapacity', 'seriesVersion', 'exDates',
      ],
      populate: { product: { fields: ['id'] } },
    });
    if (!series) throw new Error('Series not found');

    const rr = this.buildRRule(series);
    const allDates = rr.between(rangeStart, rangeEnd, true);

    // exDates bezpečne
    const exArr: string[] = isArr(series.exDates) ? (series.exDates as unknown[]).map(String) : [];
    const exSet = new Set<string>(exArr.map((d) => new Date(d).toISOString().slice(0, 10)));
    const occurrences = allDates.filter((d) => !exSet.has(d.toISOString().slice(0, 10)));

    const productId: number | undefined = (series as any)?.product?.id ?? undefined;

    // 1) Načítaj všetky existujúce sessions v rozsahu jedným dotazom
    const existing = await strapi.entityService.findMany('api::event-session.event-session', {
      filters: {
        isDetachedFromSeries: { $eq: false },
        startDateTime: { $gte: rangeStart.toISOString(), $lte: rangeEnd.toISOString() },
        $or: [
          { series: { id: { $eq: series.id } } },
          { series: { $null: true } }, // pre attach starších bez série
        ],
      },
      populate: { series: { fields: ['id'] } },
      fields: ['id', 'startDateTime', 'seriesVersion'],
      sort: { startDateTime: 'asc' },
    });

    // 2) Mapa existujúcich podľa presného ISO času
    const existMap = new Map<string, { id: number; seriesId?: number; seriesVersion?: number }>();
    for (const e of existing as any[]) {
      const key = new Date(e.startDateTime).toISOString();
      existMap.set(key, { id: e.id, seriesId: e.series?.id, seriesVersion: e.seriesVersion ?? 0 });
    }

    // 3) Prejdi výskyty a podľa mapy Create/Update
    const touchedDates: string[] = [];
    let changed = 0;

    for (const dt of occurrences) {
      const iso = new Date(dt).toISOString();
      const hit = existMap.get(iso);

      if (hit) {
        const needsAttach = !hit.seriesId;
        const needsVersionBump = (hit.seriesVersion ?? 0) !== series.seriesVersion;

        if (needsAttach || needsVersionBump) {
          // Pozn.: "data" typujeme ako any kvôli flexibilite (product môže byť required/optional podľa tvojej schémy)
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

      // CREATE novej session
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

  /**
   * Zvýši verziu série a regeneruje budúce termíny (od "from" alebo od teraz) na 6 mesiacov dopredu.
   */
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
      : (() => { const d = new Date(rangeStart); d.setMonth(d.getMonth() + 6); return d; })();

    return this.generateSessionsForRange(seriesId, rangeStart, rangeEnd);
  },

  /**
   * Odpojí konkrétny termín od série (už sa nebude hromadne prepisovať).
   */
  async detachSession(sessionId: number) {
    return strapi.entityService.update('api::event-session.event-session', sessionId, {
      data: { isDetachedFromSeries: true },
    });
  },

  /**
   * Hromadne upraví budúce (neodpojené) sessions v aktuálnej verzii série.
   */
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

  /**
 * Zmaže budúce sessions, ktoré už nie sú v novej sade výskytov.
 * - ak protectWithBookings=true, sessions s aktívnymi bookingmi sa NEMAŽÚ
 *   (voliteľne sa auto-detachnú: autoDetachProtected=true).
 * - keepISOs je zoznam ISO časov, ktoré si chceš ponechať (vracia ho generateSessionsForRange().dates).
 */
async pruneFutureSessions(
    seriesId: number,
    rangeStart: Date,
    rangeEnd: Date,
    keepISOs: string[],
    opts: {
      protectWithBookings?: boolean;
      autoDetachProtected?: boolean;
      bookingWhere?: any; // voliteľný vlastný filter (napr. status != 'cancelled')
    } = { protectWithBookings: true, autoDetachProtected: true }
  ) {
    const keep = new Set(keepISOs.map((d) => new Date(d).toISOString()));
  
    // Kandidáti na zmazanie = budúce ne-detached sessions tejto série v rozsahu
    const candidates = await strapi.entityService.findMany('api::event-session.event-session', {
      filters: {
        series: { id: { $eq: seriesId } },
        isDetachedFromSeries: { $eq: false },
        startDateTime: { $gte: rangeStart.toISOString(), $lte: rangeEnd.toISOString() },
      },
      fields: ['id','startDateTime'],
    });
  
    let removed = 0;
    let protectedCnt = 0;
    let detachedCnt = 0;
  
    for (const s of candidates as any[]) {
      const iso = new Date(s.startDateTime).toISOString();
      // je v novej sade? ponechaj
      if (keep.has(iso)) continue;
  
      if (opts.protectWithBookings) {
        // zisti aktívne bookingy (prispôsob si statusy)
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
          continue; // nechaj na mieste (nevymazávaj)
        }
      }
  
      // žiadne aktívne bookingy → bezpečné zmazať
      await strapi.entityService.delete('api::event-session.event-session', s.id);
      removed++;
    }
  
    return { scanned: (candidates as any[]).length, removed, protected: protectedCnt, autoDetached: detachedCnt };
  }

}));
