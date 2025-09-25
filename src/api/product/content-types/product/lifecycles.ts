import slugify from 'slugify';

const UID = 'api::product.product';
type Locale = 'sk' | 'en' | 'de';

/** Nastav, ktoré väzby sú lokalizované (majú vlastné mutácie s documentId) */
const LOCALIZED_REL = {
  categories: true, // daj false, ak kategórie nie sú i18n
  dekory: true,
  tvar: true,
  autor: true
};

// ----------------------- Helpery (typ-safe-ish) -----------------------

/** findFirst: vráti prvý riadok (alebo null) bez ohľadu na union typy Strapi */
const findFirst = async (uid: string, filters: any, populate?: any) => {
  const res: any = await strapi.entityService.findMany(uid as any, {
    filters,
    populate,
    limit: 1
  });
  const row = Array.isArray(res) ? res[0] : res;
  return row ?? null;
};

const id = (x: any) => (x ? x.id : null);
const ids = (arr: any[]) => (Array.isArray(arr) ? arr.map(id).filter(Boolean) : []);

// ----------------------- Extrakcia dát -----------------------

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

// ----------------------- Mapovanie i18n väzieb -----------------------

/** Nájde ID mutácie entity podľa documentId+locale */
const pickLocaleId = async (uid: string, documentId: string, locale: Locale) => {
  if (!documentId) return null;
  const row = await findFirst(uid, { documentId, locale });
  return row?.id || null;
};

/** Premapuj väzby na cieľový jazyk, ak sú i18n */
const mapLocalizedRelationIds = async (base: any, locale: Locale) => {
  const out: any = {};

  if (LOCALIZED_REL.categories) {
    out.categories = (
      await Promise.all(
        (base.categories || []).map((c: any) =>
          pickLocaleId('api::category.category', c.documentId, locale)
        )
      )
    ).filter(Boolean);
  } else {
    out.categories = (base.categories || []).map((c: any) => c.id);
  }

  if (LOCALIZED_REL.dekory) {
    out.dekory = (
      await Promise.all(
        (base.dekory || []).map((d: any) =>
          pickLocaleId('api::dekor.dekor', d.documentId, locale)
        )
      )
    ).filter(Boolean);
  } else {
    out.dekory = (base.dekory || []).map((d: any) => d.id);
  }

  if (LOCALIZED_REL.tvar && base.tvar?.documentId) {
    out.tvar = await pickLocaleId('api::tvar.tvar', base.tvar.documentId, locale);
  } else {
    out.tvar = base.tvar?.id || null;
  }

  if (LOCALIZED_REL.autor && base.autor?.documentId) {
    out.autor = await pickLocaleId('api::autor.autor', base.autor.documentId, locale);
  } else {
    out.autor = base.autor?.id || null;
  }

  // never i18n
  out.author = base.author?.id || null;

  // media
  out.picture_new = base.picture_new?.id || null;
  out.pictures_new = (base.pictures_new || []).map((m: any) => m.id);

  return out;
};

// ----------------------- Upsert mutácie EN/DE -----------------------

const upsertLocale = async (strapi: any, base: any, locale: Locale) => {
  if (locale === 'sk') return null;
  if (!base?.documentId) return null;

  const existing = await findFirst(UID, { documentId: base.documentId, locale });
  if (existing) return existing;

  const data = extractCloneData(base);
  const rel = await mapLocalizedRelationIds(base, locale);

  const recheck = await findFirst(UID, { documentId: base.documentId, locale });
  if (recheck) return recheck;

  const created = await strapi.entityService.create(UID as any, {
    data: {
      ...data,
      locale,
      documentId: base.documentId,
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

// ----------------------- Self-väzby (parent/variations) -----------------------

const remapSelfRelationsForLocale = async (strapi: any, skEntry: any, targetLocale: Locale) => {
  const target = await findFirst(UID, { documentId: skEntry.documentId, locale: targetLocale });
  if (!target) return;

  const sk = await strapi.entityService.findOne(UID as any, skEntry.id, {
    populate: { parent: true, variations: true }
  });

  const updates: any = {};

  if (sk.parent?.documentId) {
    const p = await findFirst(UID, { documentId: sk.parent.documentId, locale: targetLocale });
    updates.parent = p?.id || null;
  } else {
    updates.parent = null;
  }

  if (Array.isArray(sk.variations) && sk.variations.length) {
    const mapped: number[] = [];
    for (const v of sk.variations) {
      if (!v?.documentId) continue;
      const vt = await findFirst(UID, { documentId: v.documentId, locale: targetLocale });
      if (vt?.id) mapped.push(vt.id);
    }
    updates.variations = mapped;
  } else {
    updates.variations = [];
  }

  await strapi.entityService.update(UID as any, target.id, { data: updates });
};

// ----------------------- Mirroring editov SK → EN/DE -----------------------

const mirrorEditsToLocale = async (strapi: any, skEntry: any, locale: Locale) => {
  const counterpart = await upsertLocale(strapi, skEntry, locale);
  if (!counterpart) return;

  const data = extractCloneData(skEntry);
  const rel = await mapLocalizedRelationIds(skEntry, locale);

  await strapi.entityService.update(UID as any, counterpart.id, {
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

// ----------------------- Lifecycle hooks -----------------------

export default {
  /** SLUGIFY + poistka: na SK nikdy neposielaj documentId (Strapi ho vygeneruje) */
  async beforeCreate(event: { params: { data: Record<string, any> } }) {
    const { data } = event.params;

    if (data?.name && !data.slug) {
      data.slug = slugify(data.name, { lower: true, strict: true });
    }

    const isSK = !data?.locale || data.locale === 'sk';
    if (isSK && data?.documentId) {
      delete data.documentId;
    }
  },

  async beforeUpdate(event: { params: { data: Record<string, any> } }) {
    const { data } = event.params;

    if (data?.name && !data.slug) {
      data.slug = slugify(data.name, { lower: true, strict: true });
    }

    const isSK = !data?.locale || data.locale === 'sk';
    if (isSK && data?.documentId) {
      delete data.documentId; // bráni prepisu documentId na SK
    }
  },

  /** Po vytvorení SK → vyrob EN/DE, potom premapuj self-väzby */
  async afterCreate(event: any) {
    const { result } = event;
    const locale: Locale = (result?.locale || 'sk') as Locale;
    if (locale !== 'sk') return;

    await upsertLocale(strapi, result, 'en');
    await upsertLocale(strapi, result, 'de');

    await remapSelfRelationsForLocale(strapi, result, 'en');
    await remapSelfRelationsForLocale(strapi, result, 'de');
  },

  /** Po update SK → zrkadli zmeny do EN/DE (vrátane remap self-väzieb) */
  async afterUpdate(event: any) {
    const { result } = event;
    const locale: Locale = (result?.locale || 'sk') as Locale;
    if (locale !== 'sk') return;

    await mirrorEditsToLocale(strapi, result, 'en');
    await mirrorEditsToLocale(strapi, result, 'de');
  }
};
