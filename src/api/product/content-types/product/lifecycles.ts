import slugify from 'slugify';

const UID = 'api::product.product';
const SOURCE_LOCALE = 'sk';
const TARGET_LOCALES = ['en', 'de'] as const;

// guard proti rekurzii / duplicitnému syncu
const syncInProgress = new Set<string>();

type AnyRecord = Record<string, any>;

function makeSlug(value?: string | null) {
  return slugify(String(value || ''), {
    lower: true,
    strict: true,
    locale: 'sk',
  });
}

function shouldSkipLocaleSync() {
  return process.env.DISABLE_PRODUCT_LOCALE_SYNC === 'true';
}

/**
 * PRE DOCUMENT RELATIONS POUŽÍVAME IBA documentId.
 * Už nikdy nie fallback na numeric id.
 */
function documentRelationRef(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.documentId ?? null;
}

function documentRelationRefArray(values: any): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => documentRelationRef(v))
    .filter((v): v is string => !!v);
}

/**
 * PRE MEDIA RELATIONS upload plugin používa numeric id.
 */
function mediaFileId(value: any): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  return typeof value.id === 'number' ? value.id : null;
}

function mediaFileIds(values: any): number[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => mediaFileId(v))
    .filter((v): v is number => Number.isInteger(v));
}

function logError(scope: string, err: any, extra?: Record<string, any>) {
  strapi.log.error(`[product lifecycle] ${scope} FAILED: ${err?.message || err}`);

  if (extra) {
    try {
      strapi.log.error(`[product lifecycle] ${scope} EXTRA: ${JSON.stringify(extra)}`);
    } catch {}
  }

  if (err?.details) {
    try {
      strapi.log.error(`[product lifecycle] ${scope} DETAILS: ${JSON.stringify(err.details)}`);
    } catch {}
  }

  if (err?.stack) {
    strapi.log.error(err.stack);
  }
}

function buildLocalePayload(source: AnyRecord) {
  return {
    // localized
    name: source.name ?? null,
    slug: source.slug || makeSlug(source.name),
    short: source.short ?? null,
    describe: source.describe ?? null,
    seo: source.seo ?? null,

    // shared scalars
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

    // document relations
    categories: {
      set: documentRelationRefArray(source.categories),
    },
    dekory: {
      set: documentRelationRefArray(source.dekory),
    },
    parent: documentRelationRef(source.parent),
    autor: documentRelationRef(source.autor),
    tvar: documentRelationRef(source.tvar),

    // users-permissions relation ostáva numeric id
    author: source.author?.id ?? source.author ?? null,

    // media relations ostávajú numeric ids
    picture_new: mediaFileId(source.picture_new),
    pictures_new: mediaFileIds(source.pictures_new),
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

async function localeExists(documentId: string, locale: string) {
  const existing = await strapi.documents(UID).findOne({
    documentId,
    locale,
    fields: ['documentId', 'locale'] as any,
  });

  return !!existing;
}

async function syncLocale(documentId: string, locale: string) {
  const source = await loadSourceDocument(documentId);

  if (!source) {
    strapi.log.warn(`[product lifecycle] source document not found for ${documentId}`);
    return;
  }

  const data = buildLocalePayload(source);
  const exists = await localeExists(documentId, locale);

  strapi.log.info(
    `[product lifecycle] syncing ${documentId} from ${SOURCE_LOCALE} -> ${locale} (${exists ? 'update' : 'create'})`
  );

  if (!exists) {
    await strapi.documents(UID).create({
      locale,
      data: {
        documentId,
        ...data,
      },
    });
    return;
  }

  await strapi.documents(UID).update({
    documentId,
    locale,
    data,
  });
}

async function syncAllTargetLocales(documentId: string) {
  if (!documentId) return;
  if (syncInProgress.has(documentId)) {
    strapi.log.info(`[product lifecycle] sync skipped for ${documentId}, already in progress`);
    return;
  }

  syncInProgress.add(documentId);

  try {
    for (const locale of TARGET_LOCALES) {
      await syncLocale(documentId, locale);
    }

    strapi.log.info(`[product lifecycle] sync done for ${documentId}`);
  } finally {
    syncInProgress.delete(documentId);
  }
}

/**
 * DÔLEŽITÉ:
 * sync nespúšťame priamo v afterCreate/afterUpdate await-om.
 * Naplánujeme ho mimo request / mimo aktuálnej transakcie.
 */
function scheduleLocaleSync(documentId: string, trigger: 'afterCreate' | 'afterUpdate') {
  if (!documentId) return;

  setTimeout(() => {
    void (async () => {
      try {
        strapi.log.info(`[product lifecycle] scheduled sync start for ${documentId} (${trigger})`);
        await syncAllTargetLocales(documentId);
      } catch (err: any) {
        logError(`scheduled ${trigger} sync for ${documentId}`, err, { documentId, trigger });
      }
    })();
  }, 0);
}

export default {
  async beforeCreate(event: { params: { data: AnyRecord } }) {
    try {
      const { data } = event.params;

      if (data.name && !data.slug) {
        data.slug = makeSlug(data.name);
      }
    } catch (err: any) {
      logError('beforeCreate', err);
      throw err;
    }
  },

  async beforeUpdate(event: { params: { data: AnyRecord } }) {
    try {
      const { data } = event.params;

      if (data.name && !data.slug) {
        data.slug = makeSlug(data.name);
      }
    } catch (err: any) {
      logError('beforeUpdate', err);
      throw err;
    }
  },

  async afterCreate(event: { result?: AnyRecord; params?: { data?: AnyRecord } }) {
    try {
      if (shouldSkipLocaleSync()) {
        strapi.log.info('[product lifecycle] locale sync skipped because DISABLE_PRODUCT_LOCALE_SYNC=true');
        return;
      }

      const result = event.result;
      if (!result?.documentId) return;

      const locale = event.params?.data?.locale || result.locale || SOURCE_LOCALE;
      if (locale !== SOURCE_LOCALE) return;

      scheduleLocaleSync(result.documentId, 'afterCreate');
    } catch (err: any) {
      logError('afterCreate', err, {
        documentId: event?.result?.documentId,
        locale: event?.result?.locale,
      });
      throw err;
    }
  },

  async afterUpdate(event: { result?: AnyRecord; params?: { data?: AnyRecord } }) {
    try {
      if (shouldSkipLocaleSync()) {
        strapi.log.info('[product lifecycle] locale sync skipped because DISABLE_PRODUCT_LOCALE_SYNC=true');
        return;
      }

      const result = event.result;
      if (!result?.documentId) return;

      const locale = event.params?.data?.locale || result.locale || SOURCE_LOCALE;
      if (locale !== SOURCE_LOCALE) return;

      scheduleLocaleSync(result.documentId, 'afterUpdate');
    } catch (err: any) {
      logError('afterUpdate', err, {
        documentId: event?.result?.documentId,
        locale: event?.result?.locale,
      });
      throw err;
    }
  },
};