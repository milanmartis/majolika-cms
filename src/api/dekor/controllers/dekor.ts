import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::dekor.dekor', ({ strapi }) => ({
  async findAll(ctx) {
    const data = await strapi.entityService.findMany('api::dekor.dekor', {
      sort: ['nazov:asc'],
      fields: ['id', 'nazov', 'slug'],
      filters: { slug: { $notNull: true } },
      populate: {},
    });
    ctx.send({ data });
  },
}));