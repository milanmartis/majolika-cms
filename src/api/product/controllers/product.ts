import { factories } from '@strapi/strapi';

const productPopulate = {
  picture_new: true,
  pictures_new: true,
  categories: { populate: { parent: true } },
  dekory: true,
  tvar: true,
  variations: {
    populate: {
      picture_new: true,
      pictures_new: true,
      categories: { populate: { parent: true } },
      dekory: true,
      tvar: true,
    },
  },
};

export default factories.createCoreController('api::product.product', ({ strapi }) => ({

  async find(ctx) {
    ctx.query.populate = productPopulate;
    return super.find(ctx);
  },

  async findOne(ctx) {
    ctx.query = {
      ...ctx.query,
      populate: productPopulate,
    };
    return super.findOne(ctx);
  },

  async findByCategory(ctx) {
    const { slug } = ctx.params;
    const dekoryRaw = ctx.query.dekory;
    const tvaryRaw = ctx.query.tvary;

    const dekory = typeof dekoryRaw === 'string' ? dekoryRaw.split(',') : [];
    const tvary = typeof tvaryRaw === 'string' ? tvaryRaw.split(',') : [];

    // 1. Získaj kategóriu podľa slug
    const [category] = await strapi.entityService.findMany('api::category.category', {
      filters: { category_slug: slug },
      fields: ['id'],
    });

    if (!category) return ctx.send({ data: [] });

    // 2. Zostav filter pre variácie podľa dekory a tvary (slugy)
    const andFilters: any[] = [];
    dekory.forEach((d) => andFilters.push({ dekory: { slug: { $eqi: d } } }));
    tvary.forEach((t) => andFilters.push({ tvar: { slug: { $eqi: t } } }));

    // Ak nie sú žiadne filtre, rovno vráť všetky produkty v kategórii
    if (andFilters.length === 0) {
      const all = await strapi.entityService.findMany('api::product.product', {
        filters: {
          categories: { id: category.id },
          public: true,
        },
        populate: productPopulate,
      });
      return ctx.send({ data: all });
    }

    // 3. Vyhľadaj všetky variácie, ktoré vyhovujú slug filtrom
    const variations = await strapi.entityService.findMany('api::product.product', {
      filters: { $and: andFilters },
      populate: ['parent'],
    });

    const parentIds = (variations as any[])
      .map((v) => v.parent?.id)
      .filter((id, i, arr) => id && arr.indexOf(id) === i); // distinct a truthy

    // 4. Vyhľadaj parent produkty, ktoré sú v danej kategórii
    const products = await strapi.entityService.findMany('api::product.product', {
      filters: {
        id: { $in: parentIds },
        categories: { id: category.id },
        public: true,
      },
      populate: productPopulate,
    });

    return ctx.send({ data: products });
  }

}));
