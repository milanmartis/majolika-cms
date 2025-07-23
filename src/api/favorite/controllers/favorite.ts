import { factories } from '@strapi/strapi';
import type { Context } from 'koa';

const { createCoreController } = factories;

export default createCoreController('api::favorite.favorite', ({ strapi }) => ({
  async find(ctx: Context) {
    const user = ctx.state.user as { id: number } | undefined;
    if (!user) {
      ctx.body = { data: [], meta: { pagination: { total: 0, page: 1, pageSize: 25, pageCount: 1 } } };
      return;
    }

    ctx.query = {
      ...(ctx.query as any),
      filters: {
        ...(ctx.query as any).filters,
        user: { id: user.id },
      },
    };
    return await super.find(ctx);
  },

  async create(ctx: Context) {
    const user = ctx.state.user as { id: number } | undefined;
    if (!user) return ctx.unauthorized('Musíte byť prihlásený.');

    const body = ctx.request.body as any;
    const product = body?.data?.product;
    if (!product) return ctx.badRequest('product field missing');

    // zabráň duplicite
    const existing = await strapi.db.query('api::favorite.favorite').findOne({
      where: { user: user.id, product },
      select: ['id'],
    });
    if (existing) return ctx.conflict('Už je v obľúbených.');

    ctx.request.body = { data: { user: user.id, product } };
    return await super.create(ctx);
  },

  async delete(ctx: Context) {
    const user = ctx.state.user as { id: number } | undefined;
    if (!user) return ctx.unauthorized('Musíte byť prihlásený.');

    // over vlastníctvo priamo v dotaze
    const fav = await strapi.db.query('api::favorite.favorite').findOne({
      where: { id: ctx.params.id, user: user.id },
      select: ['id'],
    });

    if (!fav) {
      return ctx.unauthorized('Môžete mazať len svoje vlastné obľúbené.');
    }

    return await super.delete(ctx);
  },
}));