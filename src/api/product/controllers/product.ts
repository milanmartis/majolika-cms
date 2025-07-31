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

    // 1. Získaj ID kategórie podľa slug
    const [category] = await strapi.entityService.findMany('api::category.category', {
      filters: { category_slug: slug },
      fields: ['id'],
    });

    if (!category) return ctx.send({ data: [] });

    // 2. Získaj všetky variácie podľa dekoru/tvaru
    const variationFilters: any[] = [];
    dekory.forEach((d) => variationFilters.push({ dekory: { nazov: { $containsi: d } } }));
    tvary.forEach((t) => variationFilters.push({ tvar: { nazov: { $containsi: t } } }));

    const variations = await strapi.entityService.findMany('api::product.product', {
      filters: {
        $or: variationFilters,
      },
      populate: ['parent'],
    });

    const parentIds = (variations as any[])
      .map((v) => v.parent?.id)
      .filter((id, i, arr) => id && arr.indexOf(id) === i); // distinct IDs

    // 3. Vráť parent produkty, ktoré patria do kategórie
    const products = await strapi.entityService.findMany('api::product.product', {
      filters: {
        id: { $in: parentIds },
        categories: { id: category.id },
        public: true,
      },
      populate: productPopulate,
    });

    ctx.send({ data: products });
  }

}));
