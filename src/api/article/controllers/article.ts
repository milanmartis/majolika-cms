import { factories } from '@strapi/strapi';
import { Context } from 'koa';

export default factories.createCoreController('api::article.article', ({ strapi }) => ({
  async findBySlug(ctx: Context) {
    const { slug } = ctx.params;

    const [article] = await strapi.entityService.findMany(
      'api::article.article',
      {
        filters: { slug },
        populate: {
          /* ①  dynamic-zone  */
          content: {
            /* ②  star = populuj VŠETKO na „druhej úrovni“  */
            populate: '*',
          },
        },
        limit: 1,
      } as any         // ← obídeme prísny TS typ (viď predchádzajúce vysvetlenie)
    );

    if (!article) return ctx.notFound('Article not found');

    return this.transformResponse(article);
  },
}));