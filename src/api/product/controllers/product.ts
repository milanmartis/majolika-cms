import { factories } from '@strapi/strapi';

// spoločná definícia populate – aby sa neopakovala
const productPopulate = {
  picture_new: true,
  pictures_new: true,
  variations: {
    populate: {
      picture_new: true,
      pictures_new: true,
      products_dekory_lnk: {
        populate: { dekor: true }
      },
      products_tvar_lnk: {
        populate: { tvar: true }
      }
    },
  },
  categories: {
    populate: ['variations']
  },
};

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  /* -------------------------------------------------------------
   * GET /api/products  (so stránkovaním & komplet populate)
   * ----------------------------------------------------------- */
  async find(ctx: any) {
    // zachováme všetky prijaté query-params vrátane pagination[start], limit, page, pageSize
    ctx.query.populate = productPopulate;
    return super.find(ctx);
  },

  /* -------------------------------------------------------------
   * GET /api/products/:id  (detail produktu)
   * ----------------------------------------------------------- */
  async findOne(ctx: any) {
    ctx.query = {
      ...ctx.query,
      populate: productPopulate,
    };
    return super.findOne(ctx);
  },
}));
