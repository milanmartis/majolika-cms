import { factories } from '@strapi/strapi';
import { Context } from 'koa';

export default factories.createCoreController('api::article.article', ({ strapi }) => ({
  async findBySlug(ctx: Context) {
    const { slug } = ctx.params;
    const locale = ctx.query.locale || 'en'; // default môže byť 'en'

    const [article] = await strapi.entityService.findMany(
      'api::article.article',
      {
        filters: { 
          slug,
          locale   // filtruj podľa jazyka
        },
        populate: {
          content: {
            populate: '*',
          },
        },
        limit: 1,
      } as any
    );

    if (!article) return ctx.notFound('Article not found');

    return this.transformResponse(article);
  },
}));
