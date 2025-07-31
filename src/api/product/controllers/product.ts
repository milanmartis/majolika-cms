import { factories } from '@strapi/strapi';

const productPopulate = {
  picture_new: true,
  pictures_new: true,
  categories: { populate: ['parent'] },
  dekory: true,
  tvar: true,
  variations: {
    populate: {
      picture_new: true,
      pictures_new: true,
      categories: { populate: ['parent'] },
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

    ctx.query = {
      ...ctx.query,
      populate: productPopulate,
      filters: {
        $or: [
          {
            categories: {
              category_slug: {
                $eq: slug,
              },
            },
          },
          {
            variations: {
              categories: {
                category_slug: {
                  $eq: slug,
                },
              },
            },
          },
        ],
      },
    };

    return await strapi.entityService.findMany('api::product.product', ctx.query);
  }

}));
