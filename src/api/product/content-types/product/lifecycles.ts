import slugify from 'slugify';

const UID = 'api::product.product';
type Locale = 'sk' | 'en' | 'de';

/** KONFIG: nastav, ktoré vzťahy sú i18n (majú vlastné mutácie s documentId) */
const LOCALIZED_REL = {
  categories: true,  // daj false, ak kategórie nie sú lokalizované
  dekory: true,
  tvar: true,
  autor: true
};

const id = (x: any) => (x ? x.id : null);
const ids = (arr: any[]) => (Array.isArray(arr) ? arr.map(id).filter(Boolean) : []);

const extractCloneData = (entry: any) => ({
  externalId: entry.externalId ?? null,
  type: entry.type ?? 'simple',
  ean: entry.ean ?? null,
  name: entry.name ?? null,
  slug: entry.slug ?? null,
  short: entry.short ?? null,
  describe: entry.describe ?? null,
  public: entry.public ?? false,
  price: entry.price ?? null,
  price_sale: entry.price_sale ?? null,
  vatPercentage: entry.vatPercentage ?? 20,
  inSale: entry.inSale ?? false,
  isNew: entry.isNew ?? false,
  isSoldOut: entry.isSoldOut ?? false,
  isUnavailable: entry.isUnavailable ?? false,
  isFeatured: entry.isFeatured ?? false,
  category: entry.category ?? null,
  tag: entry.tag ?? null,
  picture: entry.picture ?? null,
  variable: entry.variable ?? null,
  vyska_cm: entry.vyska_cm ?? null,
  sirka_cm: entry.sirka_cm ?? null,
  hlbka_cm: entry.hlbka_cm ?? null,
  objem_ml: entry.objem_ml ?? null,
  vaha_g: entry.vaha_g ?? null,
  productEventType: entry.productEventType ?? 'none',
  seo: entry.seo ?? null
});

const extractNonSelfRelationIds = (entry: any) => ({
  picture_new: id(entry.picture_new),
  pictures_new: ids(entry.pictures_new),
  categories: ids(entry.categories),
  dekory: ids(entry.dekory),
  tvar: id(entry.tvar),
  autor: id(entry.autor),
  author: id(entry.author),
  parent: entry.parent || null,
  variations: Array.isArray(entry.variations) ? entry.variations : []
});

/** Pomocník: nájdi ID mutácie entity podľa documentId+locale */
const pickLocaleId = async (uid: string, documentId: string, locale: Locale) => {
  if (!documentId) return null;
  const [row] = await strapi.entityService.findMany(uid, {
    filters: { documentId, locale },
    limit: 1
  });
  return row?.id || null;
};

/** Ak sú vzťahy lokalizované, premapuj ich ID na cieľový jazyk */
const mapLocalizedRelationIds = async (base: any, locale: Locale) => {
  const out: any = {};
  // categories (M2M)
  if (LOCALIZED_REL.categories) {
    out.categories = (
      await Promise.all(
        (base.categories || []).map((c: any) => pickLocaleId('api::category.category', c.documentId, locale))
      )
    ).filter(Boolean);
  } else out.categories = (base.categories || []).map((c: any) => c.id);

  // dekory (M2M)
  if (LOCALIZED_REL.dekory) {
    out.dekory = (
      await Promise.all(
        (base.dekory || []).map((d: any) => pickLocaleId('api::dekor.dekor', d.documentId, locale))
      )
    ).filter(Boolean);
  } else out.dekory = (base.dekory || []).map((d: any) => d.id);

  // tvar (M2O)
  if (LOCALIZED_REL.tvar && base.tvar?.documentId) {
    out.tvar = await pickLocaleId('api::tvar.tvar', base.tvar.documentId, locale);
  } else out.tvar = base.tvar?.id || null;

  // autor (M2O, vlastná entita – nie user)
  if (LOCALIZED_REL.autor && base.autor?.documentId) {
    out.autor = await pickLocaleId('api::autor.autor', base.autor.documentId, locale);
  } else out.autor = base.autor?.id || null;

  // author (users-permissions user) nikdy nie je i18n
  out.author = base.author?.id || null;

  // media sa nelokalizujú
  out.picture_new = base.picture_new?.id || null;
  out.pictures_new = (base.pictures_new || []).map((m: any) => m.id);

  return out;
};

/** Bezpečné „create, ak neexistuje“ pre EN/DE mutáciu */
const upsertLocale = async (strapi: any, base: any, locale: Locale) => {
  if (locale === 'sk') return null; // nikdy netvor SK
  if (!base?.documentId) return null;

  const existing = await strapi.entityService.findMany(UID, {
    filters: { documentId: base.documentId, locale },
    limit: 1
  });
  if (existing?.length) return existing[0];

  const data = extractCloneData(base);
  const rel = await mapLocalizedRelationIds(base, locale);

  // posledná kontrola pred create (race)
  const recheck = await strapi.entityService.findMany(UID, {
    filters: { documentId: base.documentId, locale },
    limit: 1
  });
  if (recheck?.length) return recheck[0];

  const created = await strapi.entityService.create(UID, {
    data: {
      ...data,
      locale,
      documentId: base.documentId,
      // media & non-self relations
      picture_new: rel.picture_new,
      pictures_new: rel.pictures_new,
      categories: rel.categories,
      dekory: rel.dekory,
      tvar: rel.tvar,
      autor: rel.autor,
      author: rel.author
    }
  });

  return created;
};

/** Premapuj self-vzťahy (parent/variations) v cieľovej locale podľa documentId */
const remapSelfRelationsForLocale = async (strapi: any, skEntry: any, targetLocale: Locale) => {
  const [target] = await strapi.entityService.findMany(UID, {
    filters: { documentId: skEntry.documentId, locale: targetLocale },
    limit: 1
  });
  if (!target) return;

  const sk = await strapi.entityService.findOne(UID, skEntry.id, {
    populate: { parent: true, variations: true }
  });

  const updates: any = {};

  if (sk.parent?.documentId) {
    const [p] = await strapi.entityService.findMany(UID, {
      filters: { documentId: sk.parent.documentId, locale: targetLocale },
      limit: 1
    });
    updates.parent = p?.id || null;
  } else updates.parent = null;

  if (Array.isArray(sk.variations) && sk.variations.length) {
    const mapped: number[] = [];
    for (const v of sk.variations) {
      if (!v?.documentId) continue;
      const [vt] = await strapi.entityService.findMany(UID, {
        filters: { documentId: v.documentId, locale: targetLocale },
        limit: 1
      });
      if (vt?.id) mapped.push(vt.id);
    }
    updates.variations = mapped;
  } else updates.variations = [];

  await strapi.entityService.update(UID, target.id, { data: updates });
};

/** Zosynchronizuj zmeny SK → EN/DE (bez self-väzieb, tie sa doťuknú zvlášť) */
const mirrorEditsToLocale = async (strapi: any, skEntry: any, locale: Locale) => {
  const counterpart = await upsertLocale(strapi, skEntry, locale);
  if (!counterpart) return;

  const data = extractCloneData(skEntry);
  const rel = await mapLocalizedRelationIds(skEntry, locale);

  await strapi.entityService.update(UID, counterpart.id, {
    data: {
      ...data,
      picture_new: rel.picture_new,
      pictures_new: rel.pictures_new,
      categories: rel.categories,
      dekory: rel.dekory,
      tvar: rel.tvar,
      autor: rel.autor,
      author: rel.author
    }
  });

  await remapSelfRelationsForLocale(strapi, skEntry, locale);
};

export default {
  /** SLUGIFY + odstraň documentId pri SK create/update (poistka proti duplikátu) */
  async beforeCreate(event: { params: { data: Record<string, any> } }) {
    const { data } = event.params;

    if (data?.name && !data.slug) {
      data.slug = slugify(data.name, { lower: true, strict: true });
    }

    const isSK = !data?.locale || data.locale === 'sk';
    if (isSK && data?.documentId) {
      delete data.documentId; // SK si documentId generuje Strapi samo
    }
  },

  async beforeUpdate(event: { params: { data: Record<string, any> } }) {
    const { data } = event.params;

    if (data?.name && !data.slug) {
      data.slug = slugify(data.name, { lower: true, strict: true });
    }

    const isSK = !data?.locale || data.locale === 'sk';
    if (isSK && data?.documentId) {
      delete data.documentId; // nedovoľ prepisovať documentId na SK
    }
  },

  /** Po vytvorení SK → vyrob EN/DE + premapped self-väzby */
  async afterCreate(event: any) {
    const { result } = event;
    const locale: Locale = (result?.locale || 'sk') as Locale;
    if (locale !== 'sk') return;

    await upsertLocale(strapi, result, 'en');
    await upsertLocale(strapi, result, 'de');

    await remapSelfRelationsForLocale(strapi, result, 'en');
    await remapSelfRelationsForLocale(strapi, result, 'de');
  },

  /** Po update SK → zrkadli zmeny do EN/DE */
  async afterUpdate(event: any) {
    const { result } = event;
    const locale: Locale = (result?.locale || 'sk') as Locale;
    if (locale !== 'sk') return;

    await mirrorEditsToLocale(strapi, result, 'en');
    await mirrorEditsToLocale(strapi, result, 'de');
  }
};
