import slugify from 'slugify';

const UID = 'api::product.product';
const SOURCE_LOCALE = 'sk';
const TARGET_LOCALES = ['en', 'de'];

type AnyRecord = Record<string, any>;

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

function buildLocalizedData(source: AnyRecord) {
  return {
    name: source.name ?? null,
    slug: source.slug || makeSlug(source.name),
    short: source.short ?? null,
    describe: source.describe ?? null,
    seo: source.seo ? deepClone(source.seo) : null,
  };
}

async function ensureLocaleVersion(documentId: string, locale: string) {
  const existing = await strapi.documents(UID).findOne({
    documentId,
    locale,
    fields: ['documentId', 'locale'] as any,
  });

  if (existing) {
    return existing;
  }

  const source = await strapi.documents(UID).findOne({
    documentId,
    locale: SOURCE_LOCALE,
    fields: ['documentId', 'name', 'slug', 'short', 'describe', 'locale'] as any,
    populate: {
      seo: true,
    },
  });

  if (!source) {
    return null;
  }

  // V Strapi 5 Document Service API sa locale verzia dokumentu rieši cez
  // documentId + locale.
  return await strapi.documents(UID).update({
    documentId,
    locale,
    data: buildLocalizedData(source),
  });
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

    const createdLocale =
      event.params?.data?.locale ||
      result.locale ||
      SOURCE_LOCALE;

    // Rob to iba keď vznikol SK záznam.
    if (createdLocale !== SOURCE_LOCALE) return;

    for (const locale of TARGET_LOCALES) {
      try {
        await ensureLocaleVersion(result.documentId, locale);
      } catch (err: any) {
        strapi.log.error(
          `[product lifecycles] Failed to create locale "${locale}" for documentId=${result.documentId}: ${err?.message || err}`
        );
      }
    }
  },
};