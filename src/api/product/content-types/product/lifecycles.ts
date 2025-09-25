import slugify from 'slugify';

const UID = 'api::product.product';
type Locale = 'sk' | 'en' | 'de';

/** Pomocný pick ID z entity/media */
const id = (x: any) => (x ? x.id : null);

/** Z poľa vyrob pole ID */
const ids = (arr: any[]) => (Array.isArray(arr) ? arr.map(id).filter(Boolean) : []);

/** Zo záznamu vytiahni všetky skalárne a embedded dáta na klonovanie */
const extractCloneData = (entry: any) => ({
  // skalárne + i18n polia
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

  // komponenty
  seo: entry.seo ?? null
});

/** Zo záznamu vytiahni ID všetkých väzieb okrem self-vzťahov (tie premapujeme zvlášť) */
const extractNonSelfRelationIds = (entry: any) => ({
  // media
  picture_new: id(entry.picture_new),
  pictures_new: ids(entry.pictures_new),

  // relations (non-self)
  categories: ids(entry.categories),
  dekory: ids(entry.dekory),
  tvar: id(entry.tvar),
  autor: id(entry.autor),
  author: id(entry.author),

  // self vzťahy len prenesieme ako entity; neskôr sa premapujú na správnu locale
  parent: entry.parent || null,
  variations: Array.isArray(entry.variations) ? entry.variations : []
});

/** Vytvor (ak neexistuje) mutáciu v zadanom jazyku s rovnakým documentId */
const upsertLocale = async (strapi: any, base: any, locale: Locale) => {
  const existing = await strapi.entityService.findMany(UID, {
    filters: { documentId: base.documentId, locale },
    populate: {
      parent: true,
      variations: true,
      categories: true,
      dekory: true,
      tvar: true,
      autor: true,
      author: true,
      picture_new: true,
      pictures_new: true,
      seo: true
    },
    limit: 1
  });

  if (existing?.length) return existing[0];

  const data = extractCloneData(base);
  const rel = extractNonSelfRelationIds(base);

  // 1) vytvor klon s rovnakým documentId + prirad non-self väzby
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

/** Premapuj self-vzťahy (parent/variations) do cieľovej locale podľa documentId */
const remapSelfRelationsForLocale = async (strapi: any, skEntry: any, targetLocale: Locale) => {
  // nájdi protikus (EN/DE) pre tento produkt
  const targetList = await strapi.entityService.findMany(UID, {
    filters: { documentId: skEntry.documentId, locale: targetLocale },
    limit: 1
  });
  const target = targetList?.[0];
  if (!target) return;

  // načítaj SK záznam so self vzťahmi
  const sk = await strapi.entityService.findOne(UID, skEntry.id, {
    populate: { parent: true, variations: true }
  });

  const updates: any = {};

  // parent → partner v targetLocale
  if (sk.parent?.documentId) {
    const p = await strapi.entityService.findMany(UID, {
      filters: { documentId: sk.parent.documentId, locale: targetLocale },
      limit: 1
    });
    updates.parent = p?.[0]?.id || null;
  } else {
    updates.parent = null;
  }

  // variations → pre každé dieťa nájdi partnera v targetLocale
  if (Array.isArray(sk.variations) && sk.variations.length) {
    const mapped: number[] = [];
    for (const v of sk.variations) {
      if (!v?.documentId) continue;
      const vTarget = await strapi.entityService.findMany(UID, {
        filters: { documentId: v.documentId, locale: targetLocale },
        limit: 1
      });
      if (vTarget?.[0]?.id) mapped.push(vTarget[0].id);
    }
    updates.variations = mapped;
  } else {
    updates.variations = [];
  }

  await strapi.entityService.update(UID, target.id, { data: updates });
};

/** Prenes zmeny SK → EN/DE (skalárne + media + non-self relations) */
const mirrorEditsToLocale = async (strapi: any, skEntry: any, locale: Locale) => {
  const counterpart = await upsertLocale(strapi, skEntry, locale);
  const data = extractCloneData(skEntry);
  const rel = extractNonSelfRelationIds(skEntry);

  // update proti-kusy (bez self vzťahov)
  await strapi.entityService.update(UID, counterpart.id, {
    data: {
      ...data,
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

  // a potom premapuj self-vzťahy
  await remapSelfRelationsForLocale(strapi, skEntry, locale);
};

export default {
  /**
   * Your original logic: autogenerate slug from name when slug not supplied.
   */
  async beforeCreate(event: { params: { data: Record<string, any> } }) {
    const { data } = event.params;
    if (data?.name && !data.slug) {
      data.slug = slugify(data.name, { lower: true, strict: true });
    }
  },

  async beforeUpdate(event: { params: { data: Record<string, any> } }) {
    const { data } = event.params;
    if (data?.name && !data.slug) {
      data.slug = slugify(data.name, { lower: true, strict: true });
    }
  },

  /**
   * After create: ak je nová položka v SK, vyrob EN/DE zrkadlá.
   */
  async afterCreate(event: any) {
    const { result } = event;
    const locale: Locale = (result?.locale || 'sk') as Locale;
    if (locale !== 'sk') return;

    // vytvor/zaisti EN & DE
    const en = await upsertLocale(strapi, result, 'en');
    const de = await upsertLocale(strapi, result, 'de');

    // premapuj self-vzťahy do EN/DE
    await remapSelfRelationsForLocale(strapi, result, 'en');
    await remapSelfRelationsForLocale(strapi, result, 'de');
  },

  /**
   * After update: ak sa edituje SK, zosynchronizuj zmeny do EN/DE.
   * (edit EN/DE sa ďalej NEšíri, aby nevznikla slučka)
   */
  async afterUpdate(event: any) {
    const { result } = event;
    const locale: Locale = (result?.locale || 'sk') as Locale;
    if (locale !== 'sk') return;

    await mirrorEditsToLocale(strapi, result, 'en');
    await mirrorEditsToLocale(strapi, result, 'de');
  }
};
