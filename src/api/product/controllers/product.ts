import { factories } from '@strapi/strapi';

// spoločná definícia populate – aby sa neopakovala
const productPopulate = {
  picture_new: true,
  pictures_new: true,

  // Variácie a ich obrázky
  variations: {
    populate: {
      picture_new: true,
      pictures_new: true,
    },
  },

  // Tu sa pridávajú kategórie aj s rodičom (parent). 
  // Ak by ste chceli aj podkategórie, môžete pridať 'children' rovnako.
  categories: {
    populate: ['parent']    // <-- vráti polia categories.data[i].attributes.parent.data
  },
};

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  /* -------------------------------------------------------------
   * GET /api/products  (so stránkovaním & komplet populate)
   * ----------------------------------------------------------- */
  async find(ctx: any) {
    ctx.query = {
      ...ctx.query,
      pagination: { pageSize: 2000 },
      populate: productPopulate,
    };
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
