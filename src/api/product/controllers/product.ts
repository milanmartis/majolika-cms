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
  
    const dekory = typeof dekoryRaw === 'string' && dekoryRaw.length > 0
      ? dekoryRaw.split(',') : [];
    const tvary = typeof tvaryRaw === 'string' && tvaryRaw.length > 0
      ? tvaryRaw.split(',') : [];
  
    // 1. Nájdeme kategóriu podľa slug
    const [category] = await strapi.entityService.findMany('api::category.category', {
      filters: { category_slug: slug },
      fields: ['id'],
    });
  
    if (!category) return ctx.send({ data: [] });
  
    // 2. Zostavíme filter pre produkty v kategórii + dekor + tvar
    const baseFilter = {
      categories: { id: category.id },
      public: true,
    };
  
    // Ak nie sú vybrané dekory ani tvary, vráť všetky produkty v kategórii
    if (!dekory.length && !tvary.length) {
      const all = await strapi.entityService.findMany('api::product.product', {
        filters: baseFilter,
        populate: productPopulate,
      });
      return ctx.send({ data: all });
    }
  
    // Priprav $or filtre na dekory/tvary aj na parent aj na variácie
    const orFilters = [];
  
    dekory.forEach((slug) => {
      orFilters.push({ dekory: { slug: { $eqi: slug } } });                    // parent má dekor
      orFilters.push({ variations: { dekory: { slug: { $eqi: slug } } } });    // variácia má dekor
    });
  
    tvary.forEach((slug) => {
      orFilters.push({ tvar: { slug: { $eqi: slug } } });                      // parent má tvar
      orFilters.push({ variations: { tvar: { slug: { $eqi: slug } } } });      // variácia má tvar
    });
  
    // Kombinujeme s base filterom a $or
    const products = await strapi.entityService.findMany('api::product.product', {
      filters: {
        ...baseFilter,
        ...(orFilters.length > 0 ? { $or: orFilters } : {}),
      },
      populate: productPopulate,
    });
  
    return ctx.send({ data: products });
  }

}));
