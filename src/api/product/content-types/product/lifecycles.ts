import slugify from 'slugify';

/**
 * Bezpečné orezanie HTML a skrátenie textu na dĺžku vhodnú pre meta description.
 */
function stripHtml(input?: string, max = 155): string | undefined {
  if (!input) return undefined;
  // odstráň HTML tagy
  const noHtml = input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!noHtml) return undefined;
  return noHtml.length > max ? noHtml.slice(0, max).trim() : noHtml;
}

/**
 * Vyplní chýbajúce SEO polia podľa fallback pravidiel:
 * - metaTitle: name + " | Majolika"
 * - metaDescription: z `short` alebo `describe` (bez HTML), max ~155 znakov
 * - shareImage: `picture_new` alebo prvý z `pictures_new`
 *
 * Nič NEPREPISUJE, ak už pole existuje.
 */
function ensureSeoDefaults(data: Record<string, any>) {
  // priprav objekt seo, ale neprepisuj existujúce hodnoty
  data.seo = data.seo ?? {};

  // metaTitle
  if (!data.seo.metaTitle && data.name) {
    data.seo.metaTitle = `${data.name} | Majolika`;
  }

  // metaDescription (preferuj short, potom describe)
  if (!data.seo.metaDescription) {
    const fromShort = stripHtml(data.short);
    const fromDescribe = stripHtml(data.describe);
    data.seo.metaDescription = fromShort ?? fromDescribe ?? undefined;
  }

  // shareImage – Strapi očakáva ID súboru pri media poli v komponente
  if (!data.seo.shareImage) {
    // ak v tej istej operácii prichádza obrázok, použi ho
    const single = data.picture_new;
    const firstFromMany = Array.isArray(data.pictures_new) ? data.pictures_new[0] : undefined;

    // podpor oba tvary (ak pošleš objekt so {id} alebo priamo ID)
    const getMediaId = (val: any) => (typeof val === 'object' && val?.id ? val.id : (typeof val === 'number' ? val : undefined));

    data.seo.shareImage = getMediaId(single) ?? getMediaId(firstFromMany) ?? undefined;
  }
}

export default {
  /**
   * Before creating a new Product:
   * - vygeneruj slug, ak chýba
   * - doplň SEO fallbacky, ak chýbajú
   */
  async beforeCreate(event: { params: { data: Record<string, any> } }) {
    const { data } = event.params;

    if (data.name && !data.slug) {
      data.slug = slugify(data.name, { lower: true, strict: true });
    }

    ensureSeoDefaults(data);
  },

  /**
   * Before updating a Product:
   * - ak je nové `name` a chýba `slug`, vygeneruj ho
   * - doplň PRÁZDNE SEO polia (existujúce nechaj tak)
   *
   * Pozn.: pri update často neposielaš všetky polia (partial update).
   * ensureSeoDefaults preto pracuje iba s tým, čo v `data` je, a nič neprepíše.
   */
  async beforeUpdate(event: { params: { data: Record<string, any> } }) {
    const { data } = event.params;

    if (data.name && !data.slug) {
      data.slug = slugify(data.name, { lower: true, strict: true });
    }

    ensureSeoDefaults(data);
  },
};
