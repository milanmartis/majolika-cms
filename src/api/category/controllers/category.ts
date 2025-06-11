import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::category.category',
  ({ strapi }) => ({
    // Override GET /api/categories
    async find(ctx) {
      ctx.query = {
        ...ctx.query,
        pagination: { pageSize: 1000 },
        populate: ctx.query.populate ?? {
          parent: true,
          children: { populate: ['children', 'products', 'parent'] },
          products: true,
        },
      };
      return super.find(ctx);
    },

    // Override GET /api/categories/:id
    async findOne(ctx) {
      ctx.query = {
        ...ctx.query,
        populate: ctx.query.populate ?? {
          parent: true,
          children: { populate: ['children', 'products', 'parent'] },
          products: true,
        },
      };
      return super.findOne(ctx);
    },

    // Custom: GET cc
    async findRoots(ctx) {
      ctx.query = {
        ...ctx.query,
        pagination: { pageSize: 1000 },
        filters: { parent: { id: { $null: true } } },
        populate: ctx.query.populate ?? {
          parent: true,
          children: { populate: ['children', 'products', 'parent'] },
          products: true,
        },
      };
      return super.find(ctx);
    },
  })
);