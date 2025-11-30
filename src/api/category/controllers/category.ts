import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::category.category',
  ({ strapi }) => ({
    async find(ctx) {
      try {
        ctx.query = {
          ...ctx.query,
          pagination: { pageSize: 1000 },
          populate: ctx.query.populate ?? {
            parent: {
              fields: ['id', 'category_name', 'category_slug'],
            },
            children: {
              fields: ['id', 'category_name', 'category_slug'],
            },
            products: {
              fields: ['id'],
            },
          },
        };

        return await super.find(ctx);
      } catch (err) {
        strapi.log.error('Error in category.find', err);
        // aspoň niečo v response:
        ctx.throw(500, 'Error in category.find');
      }
    },

    async findOne(ctx) {
      try {
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
              fields: ['id'],
            },
          },
        };

        return await super.findOne(ctx);
      } catch (err) {
        strapi.log.error('Error in category.findOne', err);
        ctx.throw(500, 'Error in category.findOne');
      }
    },

    async findRoots(ctx) {
      try {
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
              fields: ['id'],
            },
          },
        };

        return await super.find(ctx);
      } catch (err) {
        strapi.log.error('Error in category.findRoots', err);
        ctx.throw(500, 'Error in category.findRoots');
      }
    },
  })
);
