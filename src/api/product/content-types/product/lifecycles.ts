import slugify from 'slugify';

const UID = 'api::product.product';
type Locale = 'sk' | 'en' | 'de';

const LOCALIZED_REL = {
  categories: true,
  dekory: true,
  tvar: true,
  autor: true,
};

// ---- helpers ----
const findFirst = async (uid: string, filters: any, populate?: any) => {
  const res: any = await strapi.entityService.findMany(uid as any, { filters, populate, limit: 1 });
  const row = Array.isArray(res) ? res[0] : res;
  return row ?? null;
};

const loadFullProduct = async (idOrDoc: { id?: number; documentId?: string; locale?: string }) => {
  if (idOrDoc?.id) {
    return await strapi.entityService.findOne(UID as any, idOrDoc.id, {
      populate: {
        categories: true,
        dekory: true,
        tvar: true,
        autor: true,
        author: true,
        picture_new: true,
        pictures_new: true,
        parent: { populate: ['localizations'] },
        variations: { populate: ['localizations'] },
        seo: true,
        localizations: true,
      },
    });
  }
  if (idOrDoc?.documentId) {
    return await findFirst(
      UID,
      { documentId: idOrDoc.documentId, locale: idOrDoc.locale || 'sk' },
      {
        categories: true,
        dekory: true,
        tvar: true,
        autor: true,
        author: true,
        picture_new: true,
        pictures_new: true,
        parent: { populate: ['localizations'] },
        variations: { populate: ['localizations'] },
        seo: true,
        localizations: true,
      }
    );
  }
  return null;
};

const id = (x: any) => (x ? x.id : null);
const ids = (arr: any[]) => (Array.isArray(arr) ? arr.map(id).filter(Boolean) : []);

// ---- extract ----
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
  seo: entry.seo ?? null,
});

// ---- i18n relation mapping ----
const pickLocaleId = async (uid: string, documentId: string, locale: Locale) => {
  if (!documentId) return null;
  const row = await findFirst(uid, { documentId, locale });
  return row?.id || null;
};

/** normalize: pole entít alebo pole ID → vždy pole entít s aspoň {id, documentId?} */
const normEntities = (val: any): any[] => {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  // Strapi nevkladá objekt typu { connect: [...] } do resultu po create, ale pre istotu:
  if (Array.isArray(val.connect)) return val.connect.map((v: any) => (typeof v === 'number' ? { id: v } : v));
  return [];
};

const mapLocalizedRelationIds = async (base: any, locale: Locale) => {
  const out: any = {};

  const cats = normEntities(base.categories);
  const decs = normEntities(base.dekory);

  if (LOCALIZED_REL.categories) {
    out.categories = (
      await Promise.all(
        cats.map((c: any) => pickLocaleId('api::category.category', c.documentId, locale))
      )
    ).filter(Boolean);
  } else {
    out.categories = cats.map((c: any) => c.id).filter(Boolean);
  }

  if (LOCALIZED_REL.dekory) {
    out.dekory = (
      await Promise.all(
        decs.map((d: any) => pickLocaleId('api::dekor.dekor', d.documentId, locale))
      )
    ).filter(Boolean);
  } else {
    out.dekory = decs.map((d: any) => d.id).filter(Boolean);
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

  out.author = base.author?.id || null;
  out.picture_new = base.picture_new?.id || null;
  out.pictures_new = ids(base.pictures_new);

  return out;
};

// ---- upsert locale ----
const upsertLocale = async (strapi: any, baseIn: any, locale: Locale) => {
  if (locale === 'sk') return null;
  const base = await loadFullProduct({ id: baseIn.id }); // << načítaj full, aby boli populované polia
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
      author: rel.author,
    },
  });

  return created;
};

// ---- self-relations ----
const remapSelfRelationsForLocale = async (strapi: any, skEntry: any, targetLocale: Locale) => {
  const target = await findFirst(UID, { documentId: skEntry.documentId, locale: targetLocale });
  if (!target) return;

  const sk = await strapi.entityService.findOne(UID as any, skEntry.id, {
    populate: { parent: true, variations: true },
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

// ---- mirror edits ----
const mirrorEditsToLocale = async (strapi: any, skEntryIn: any, locale: Locale) => {
  const skEntry = await loadFullProduct({ id: skEntryIn.id }); // << načítaj full
  if (!skEntry) return;

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
      author: rel.author,
    },
  });

  await remapSelfRelationsForLocale(strapi, skEntry, locale);
};

// ---- lifecycles ----
export default {
  async beforeCreate(event: { params: { data: Record<string, any> } }) {
    // normalize
    event.params = event.params || { data: {} as any };
    const data = (event.params.data = event.params.data || {});
  
    // 1) LOG (dočasne si nechaj, potom vymaž)
    strapi.log.info(`[product.beforeCreate] incoming locale=${data?.locale ?? '(none)'} documentId=${(data as any)?.documentId ?? '(none)'}`);
  
    // 2) nikdy neprijímaj documentId/id pri CREATE (hoci aj keby ich admin poslal)
    //   – zmaž aj meta polia pre istotu
    ['documentId', 'id', 'createdAt', 'updatedAt', 'publishedAt'].forEach((k) => {
      if (k in data) delete (data as any)[k];
    });
    // Strapi CM niekedy posiela aj zvyšky lokálizácií – pre istotu:
    if ('localizations' in data) delete (data as any).localizations;
  
    // 3) slugify ak chýba
    if (data?.name && !data.slug) {
      data.slug = slugify(data.name, { lower: true, strict: true });
    }
  
    // 4) normalizuj locale – keď nič nepríde, nech je 'sk'
    const L = data?.locale;
    if (L !== 'sk' && L !== 'en' && L !== 'de') {
      data.locale = 'sk';
    }
  },
  
  async beforeUpdate(event: { params: { data: Record<string, any> } }) {
    event.params = event.params || { data: {} as any };
    const data = (event.params.data = event.params.data || {});
  
    // 1) LOG (dočasne)
    strapi.log.info(`[product.beforeUpdate] incoming locale=${data?.locale ?? '(keep)'} documentId=${(data as any)?.documentId ?? '(none)'}`);
  
    // 2) pri UPDATE nikdy nedovoľ prepísať documentId/id
    ['documentId', 'id', 'createdAt', 'updatedAt', 'publishedAt'].forEach((k) => {
      if (k in data) delete (data as any)[k];
    });
    if ('localizations' in data) delete (data as any).localizations;
  
    // 3) slugify ak chýba
    if (data?.name && !data.slug) {
      data.slug = slugify(data.name, { lower: true, strict: true });
    }
  },

  async afterCreate(event: any) {
    const { result } = event;
    const locale: Locale = (result?.locale || 'sk') as Locale;
    if (locale !== 'sk') return;

    await upsertLocale(strapi, result, 'en');
    await upsertLocale(strapi, result, 'de');

    await remapSelfRelationsForLocale(strapi, result, 'en');
    await remapSelfRelationsForLocale(strapi, result, 'de');
  },

  async afterUpdate(event: any) {
    const { result } = event;
    const locale: Locale = (result?.locale || 'sk') as Locale;
    if (locale !== 'sk') return;

    await mirrorEditsToLocale(strapi, result, 'en');
    await mirrorEditsToLocale(strapi, result, 'de');
  },
};
