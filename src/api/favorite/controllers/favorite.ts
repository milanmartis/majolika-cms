import { factories } from '@strapi/strapi';
import type { Context } from 'koa';

const { createCoreController } = factories;

export default createCoreController('api::favorite.favorite', ({ strapi }) => ({
  async find(ctx: Context) {
    // cast na any, aby TS nevyhadzoval error
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Musíte byť prihlásený.');

    const query = ctx.query as any;
    ctx.query = {
      ...query,
      filters: {
        ...(query.filters as any),
        user: { id: user.id },
      },
    };
    return super.find(ctx);
  },

  async create(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Musíte byť prihlásený.');

    const body = ctx.request.body as any;
    body.data = {
      ...(body.data || {}),
      user: user.id,
    };
    ctx.request.body = body;
    return super.create(ctx);
  },

  async delete(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Musíte byť prihlásený.');

    // cast na any, aby entita mala user
    const fav = (await strapi.entityService.findOne(
      'api::favorite.favorite',
      ctx.params.id as string,
      { populate: ['user'] }
    )) as any;

    if (!fav || fav.user.id !== user.id) {
      return ctx.unauthorized('Môžete mazať len svoje vlastné obľúbené.');
    }
    return super.delete(ctx);
  },
}));
