import { factories } from '@strapi/strapi';
import { Context } from 'koa';

export default factories.createCoreController('api::article.article', ({ strapi }) => ({
  async findBySlug(ctx: Context) {
    const { slug } = ctx.params;
    const locale = ctx.query.locale || 'en'; // default môže byť 'en'

    // Nájdi všetky články so slug a locale
    const articles = await strapi.entityService.findMany(
      'api::article.article',
      {
        filters: { 
          slug,
          locale
        },
        populate: {
          content: {
            populate: '*',
          },
        },
      } as any
    );

    if (articles.length === 0) {
      return ctx.notFound('Article not found');
    }

    if (articles.length > 1) {
      // Viacero rovnakých slug + locale nie je povolené
      return ctx.badRequest('Multiple articles with the same slug and locale found');
    }

    // Presne jeden článok, vráť ho
    return this.transformResponse(articles[0]);
  },
}));
