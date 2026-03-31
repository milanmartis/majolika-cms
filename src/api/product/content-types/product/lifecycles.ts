import slugify from 'slugify';

const UID = 'api::product.product';
const SOURCE_LOCALE = 'sk';
const TARGET_LOCALES = ['en', 'de'] as const;

type AnyRecord = Record<string, any>;

const syncInProgress = new Set<string>();

function makeSlug(value?: string | null) {
  return slugify(String(value || ''), {
    lower: true,
    strict: true,
    locale: 'sk',
  });
}

function deepClone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function relationRef(value: any) {
  if (!value) return null;
  return value.documentId ?? value.id ?? null;
}

function relationRefArray(values: any): any[] {
  if (!Array.isArray(values)) return [];
  return values.map((v) => relationRef(v)).filter(Boolean);
}

function fileId(value: any) {
  if (!value) return null;
  return value.id ?? null;
}

function fileIds(values: any): number[] {
  if (!Array.isArray(values)) return [];
  return values.map((v) => v?.id).filter(Boolean);
}

function buildLocalizedOnlyPayload(source: AnyRecord) {
  return {
    name: source.name ?? null,
    slug: source.slug || makeSlug(source.name),
    short: source.short ?? null,
    describe: source.describe ?? null,
    seo: source.seo ? deepClone(source.seo) : null,
  };
}

function buildFullPayload(source: AnyRecord) {
  return {
    // localized
    name: source.name ?? null,
    slug: source.slug || makeSlug(source.name),
    short: source.short ?? null,
    describe: source.describe ?? null,
    seo: source.seo ? deepClone(source.seo) : null,

    // scalar/shared
    externalId: source.externalId ?? null,
    type: source.type ?? 'simple',
    ean: source.ean ?? null,
    isDigitalProduct: !!source.isDigitalProduct,
    public: !!source.public,
    price: source.price ?? null,
    price_retail_net: source.price_retail_net ?? null,
    price_new_2026: source.price_new_2026 ?? null,
    price_sale: source.price_sale ?? null,
    vatPercentage: source.vatPercentage ?? 23,
    inSale: !!source.inSale,
    isNew: !!source.isNew,
    isSoldOut: !!source.isSoldOut,
    isUnavailable: !!source.isUnavailable,
    isFeatured: !!source.isFeatured,
    category: source.category ?? null,
    tag: source.tag ?? null,
    picture: source.picture ?? null,
    variable: source.variable ?? null,
    vyska_cm: source.vyska_cm ?? null,
    sirka_cm: source.sirka_cm ?? null,
    hlbka_cm: source.hlbka_cm ?? null,
    objem_ml: source.objem_ml ?? null,
    vaha_g: source.vaha_g ?? null,
    productEventType: source.productEventType ?? 'none',

    // relations
    categories: { set: relationRefArray(source.categories) },
    dekory: { set: relationRefArray(source.dekory) },
    parent: relationRef(source.parent),
    autor: relationRef(source.autor),
    tvar: relationRef(source.tvar),
    author: source.author?.id ?? source.author ?? null,

    // media
    picture_new: fileId(source.picture_new),
    pictures_new: fileIds(source.pictures_new),
  };
}

async function loadSourceDocument(documentId: string) {
  return await strapi.documents(UID).findOne({
    documentId,
    locale: SOURCE_LOCALE,
    populate: {
      seo: true,
      categories: true,
      parent: true,
      author: true,
      autor: true,
      tvar: true,
      dekory: true,
      picture_new: true,
      pictures_new: true,
    },
  });
}

async function findLocale(documentId: string, locale: string) {
  return await strapi.documents(UID).findOne({
    documentId,
    locale,
    fields: ['documentId', 'locale'],
  });
}

async function ensureLocaleExists(documentId: string, locale: string) {
  const existing = await findLocale(documentId, locale);
  if (existing) return existing;

  const source = await strapi.documents(UID).findOne({
    documentId,
    locale: SOURCE_LOCALE,
    fields: ['documentId', 'name', 'slug', 'short', 'describe'],
    populate: {
      seo: true,
    },
  });

  if (!source) return null;

  return await strapi.documents(UID).create({
    locale,
    data: {
      documentId,
      ...buildLocalizedOnlyPayload(source),
    },
  });
}

async function syncLocaleFull(documentId: string, locale: string) {
  const source = await loadSourceDocument(documentId);
  if (!source) return;

  const existing = await findLocale(documentId, locale);

  if (!existing) {
    await strapi.documents(UID).create({
      locale,
      data: {
        documentId,
        ...buildFullPayload(source),
      },
    });
    return;
  }

  await strapi.documents(UID).update({
    documentId,
    locale,
    data: buildFullPayload(source),
  });
}

async function syncAllLocalesFull(documentId: string) {
  if (!documentId) return;
  if (syncInProgress.has(documentId)) return;

  syncInProgress.add(documentId);

  try {
    for (const locale of TARGET_LOCALES) {
      await syncLocaleFull(documentId, locale);
    }
  } finally {
    syncInProgress.delete(documentId);
  }
}

export default {
  async beforeCreate(event: { params: { data: AnyRecord } }) {
    const { data } = event.params;

    if (data.name && !data.slug) {
      data.slug = makeSlug(data.name);
    }
  },

  async beforeUpdate(event: { params: { data: AnyRecord } }) {
    const { data } = event.params;

    if (data.name && !data.slug) {
      data.slug = makeSlug(data.name);
    }
  },

  async afterCreate(event: { result?: AnyRecord; params?: { data?: AnyRecord } }) {
    const result = event.result;
    if (!result?.documentId) return;

    const locale = event.params?.data?.locale || result.locale || SOURCE_LOCALE;
    if (locale !== SOURCE_LOCALE) return;

    try {
      for (const targetLocale of TARGET_LOCALES) {
        await ensureLocaleExists(result.documentId, targetLocale);
      }
    } catch (err: any) {
      strapi.log.error(
        `[product lifecycle] afterCreate locale create failed for ${result.documentId}: ${err?.message || err}`
      );
    }
  },

  async afterUpdate(event: { result?: AnyRecord; params?: { data?: AnyRecord } }) {
    const result = event.result;
    if (!result?.documentId) return;

    const locale = event.params?.data?.locale || result.locale || SOURCE_LOCALE;
    if (locale !== SOURCE_LOCALE) return;

    try {
      await syncAllLocalesFull(result.documentId);
    } catch (err: any) {
      strapi.log.error(
        `[product lifecycle] afterUpdate full sync failed for ${result.documentId}: ${err?.message || err}`
      );
    }
  },
};