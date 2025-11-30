import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::category.category',
  ({ strapi }) => ({
    async find(ctx) {
      ctx.query = {
        ...ctx.query,
        pagination: { pageSize: 1000 },
        populate: ctx.query.populate ?? {
          parent: {
            fields: ['id', 'category_name', 'category_slug'],
          },
          children: {
            fields: ['id', 'category_name', 'category_slug'],
            // nepopuluj tu znova parent ani children!
          },
          products: {
            fields: ['id', 'product_name', 'product_slug'],
          },
        },
      };

      return await super.find(ctx);
    },

    async findOne(ctx) {
      ctx.query = {
        ...ctx.query,
        populate: ctx.query.populate ?? {
          parent: {
            fields: ['id', 'category_name', 'category_slug'],
          },
          children: {
            fields: ['id', 'category_name', 'category_slug'],
          },
          products: {
            fields: ['id', 'product_name', 'product_slug'],
          },
        },
      };

      return await super.findOne(ctx);
    },

    async findRoots(ctx) {
      ctx.query = {
        ...ctx.query,
        pagination: { pageSize: 1000 },
        filters: { parent: { id: { $null: true } } },
        populate: ctx.query.populate ?? {
          parent: {
            fields: ['id', 'category_name', 'category_slug'],
          },
          children: {
            fields: ['id', 'category_name', 'category_slug'],
          },
          products: {
            fields: ['id', 'product_name', 'product_slug'],
          },
        },
      };

      return await super.find(ctx);
    },
  })
);
