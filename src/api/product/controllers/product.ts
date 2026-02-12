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
    // zachová locale/sort/pagination z ctx.query, meníme iba populate
    ctx.query.populate = productPopulate;
    return super.find(ctx);
  },

  async findOne(ctx) {
    // zachová locale/sort/pagination z ctx.query, meníme iba populate
    ctx.query = {
      ...ctx.query,
      populate: productPopulate,
    };
    return super.findOne(ctx);
  },

  async findByCategory(ctx) {
    const { slug } = ctx.params as { slug: string };

    // locale môže prísť z ?locale=... (FE ho posiela), alebo zo state (i18n middleware)
    const locale =
      (ctx.query as any)?.locale ??
      (ctx.state as any)?.locale ??
      undefined;

    const dekoryRaw = (ctx.query as any)?.dekory;
    const tvaryRaw  = (ctx.query as any)?.tvary;

    const dekory: string[] =
      typeof dekoryRaw === 'string' && dekoryRaw.length > 0 ? dekoryRaw.split(',') : [];
    const tvary: string[] =
      typeof tvaryRaw === 'string' && tvaryRaw.length > 0 ? tvaryRaw.split(',') : [];

    // voliteľne prepošleme sort/pagination ak ich FE pošle
    const pagination = (ctx.query as any)?.pagination;
    const sort       = (ctx.query as any)?.sort;

    // 1) Nájdeme kategóriu podľa slug (v správnom locale)
    const categories = await strapi.entityService.findMany('api::category.category', {
      filters: { category_slug: slug },
      fields: ['id'],
      locale, // dôležité pre preklady kategórií
      pagination: { page: 1, pageSize: 1 },
    });

    const category = Array.isArray(categories) ? categories[0] : null;

    if (!category) {
      return ctx.notFound(`Kategória so slug "${slug}" neexistuje.`);
      // alebo: ctx.throw(404, `Kategória so slug "${slug}" neexistuje.`);
    }

    // 2) Base filter pre produkty v danej kategórii a iba public
    const baseFilter = {
      categories: { id: category.id },
      public: true,
    };

    // 3) Ak nie sú vybrané dekory ani tvary → vráť všetko v kategórii (v locale)
    if (!dekory.length && !tvary.length) {
      const all = await strapi.entityService.findMany('api::product.product', {
        filters: baseFilter,
        populate: productPopulate,
        locale,
        ...(pagination ? { pagination } : {}),
        ...(sort ? { sort } : {}),
      });
      return ctx.send({ data: all });
    }

    // 4) Postavíme OR filtre pre dekory aj tvary, a to na parentovi aj na variáciách
    const orFilters: any[] = [];

    dekory.forEach((slugVal) => {
      // parent má dekor
      orFilters.push({ dekory: { slug: { $eqi: slugVal } } });
      // variácia má dekor
      orFilters.push({ variations: { dekory: { slug: { $eqi: slugVal } } } });
    });

    tvary.forEach((slugVal) => {
      // parent má tvar
      orFilters.push({ tvar: { slug: { $eqi: slugVal } } });
      // variácia má tvar
      orFilters.push({ variations: { tvar: { slug: { $eqi: slugVal } } } });
    });

    // 5) Produkty podľa base filtra + OR filtrov (v locale)
    const products = await strapi.entityService.findMany('api::product.product', {
      filters: {
        ...baseFilter,
        ...(orFilters.length > 0 ? { $or: orFilters } : {}),
      },
      populate: productPopulate,
      locale,
      ...(pagination ? { pagination } : {}),
      ...(sort ? { sort } : {}),
    });

    return ctx.send({ data: products });
  },

}));
