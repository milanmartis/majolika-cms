import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::tvar.tvar', ({ strapi }) => ({
  async findAll(ctx) {
    const data = await strapi.entityService.findMany('api::tvar.tvar', {
      sort: ['nazov:asc'],
      fields: ['id', 'nazov', 'slug'],
      filters: { slug: { $notNull: true } },
      populate: {},
    });
    ctx.send({ data });
  },
}));