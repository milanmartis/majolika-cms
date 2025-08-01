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
    const { dekor, tvar } = ctx.query;

    // jednoduchý výpis dotazu (len na debug)
    console.log('➡️ findByCategory:', { slug, dekor, tvar });

    const filters = {
      categories: { category_slug: slug },
    };

    if (dekor) {
      filters['variations.dekory.nazov'] = { $containsi: dekor };
    }

    if (tvar) {
      filters['variations.tvar.nazov'] = { $containsi: tvar };
    }

    const products = await strapi.entityService.findMany('api::product.product', {
      filters,
      populate: ['variations', 'categories', 'variations.dekory', 'variations.tvar'],
    });

    ctx.body = {
      data: products,
    };
  },

}));
