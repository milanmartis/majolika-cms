import slugify from "slugify";

const makeSlug = (s: string) => slugify(s, { lower: true, strict: true });

export default {
  beforeCreate(event) {
    const { data } = event.params;
    if (data.title && (data.slug === null || data.slug === "")) {
      data.slug = makeSlug(data.title);
    }
  },

  beforeUpdate(event) {
    const { data } = event.params;

    // Dôležité: ak slug neprišiel v payload-e (undefined), NEROB NIČ
    // Generuj len keď je explicitne prázdny / null
    if (data.title && (data.slug === null || data.slug === "")) {
      data.slug = makeSlug(data.title);
    }
  },
};
