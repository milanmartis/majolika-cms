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
    const { slug } = ctx.params as { slug: string };

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

    const pagination = (ctx.query as any)?.pagination;
    const sort       = (ctx.query as any)?.sort;

    const [category] = await strapi.entityService.findMany('api::category.category', {
      filters: { category_slug: slug },
      fields: ['id'],
      locale,
    });

    if (!category) {
      return ctx.send({ data: [] });
    }

    const baseFilter = {
      categories: { id: category.id },
      public: true,
    };

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

    const orFilters: any[] = [];

    dekory.forEach((slugVal) => {
      orFilters.push({ dekory: { slug: { $eqi: slugVal } } });
      orFilters.push({ variations: { dekory: { slug: { $eqi: slugVal } } } });
    });

    tvary.forEach((slugVal) => {
      orFilters.push({ tvar: { slug: { $eqi: slugVal } } });
      orFilters.push({ variations: { tvar: { slug: { $eqi: slugVal } } } });
    });

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

  // ✅ aby Strapi nepadalo na missing handlers
  async eventSessions(ctx) {
    return ctx.throw(501, 'product.eventSessions nie je implementované');
  },

  async bookEventSession(ctx) {
    return ctx.throw(501, 'product.bookEventSession nie je implementované');
  },

  async confirmPaidBooking(ctx) {
    return ctx.throw(501, 'product.confirmPaidBooking nie je implementované');
  },

  async cancelBooking(ctx) {
    return ctx.throw(501, 'product.cancelBooking nie je implementované');
  },

}));
