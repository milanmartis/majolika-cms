import { factories } from '@strapi/strapi';
import type { Context } from 'koa';

export default factories.createCoreController('api::favorite.favorite', ({ strapi }) => ({
  async find(ctx: Context) {
    const user = ctx.state.user as { id: number } | undefined;

    if (!user) {
      ctx.body = {
        data: [],
        meta: {
          pagination: {
            total: 0,
            page: 1,
            pageSize: 25,
            pageCount: 1,
          },
        },
      };
      return;
    }

    const favorites = await strapi.entityService.findMany('api::favorite.favorite', {
      filters: {
        user: {
          id: user.id,
        },
      },
      populate: {
        product: true,
      },
    } as any);

    ctx.body = {
      data: favorites,
      meta: {
        pagination: {
          total: Array.isArray(favorites) ? favorites.length : 0,
          page: 1,
          pageSize: Array.isArray(favorites) ? favorites.length : 25,
          pageCount: 1,
        },
      },
    };
  },

  async create(ctx: Context) {
    const user = ctx.state.user as { id: number } | undefined;

    if (!user) {
      return ctx.unauthorized('Musíte byť prihlásený.');
    }

    const body = ctx.request.body as any;
    const product = body?.data?.product;

    if (!product) {
      return ctx.badRequest('product field missing');
    }

    const existing = await strapi.db.query('api::favorite.favorite').findOne({
      where: {
        user: user.id,
        product,
      },
      select: ['id'],
    });

    if (existing) {
      return ctx.conflict('Už je v obľúbených.');
    }

    const favorite = await strapi.entityService.create('api::favorite.favorite', {
      data: {
        user: user.id,
        product,
      },
      populate: {
        product: true,
      },
    } as any);

    ctx.body = { data: favorite };
  },

  async delete(ctx: Context) {
    const user = ctx.state.user as { id: number } | undefined;

    if (!user) {
      return ctx.unauthorized('Musíte byť prihlásený.');
    }

    const favId = Number(ctx.params.id);

    if (!favId || Number.isNaN(favId)) {
      return ctx.badRequest('Invalid favorite id');
    }

    const fav = await strapi.db.query('api::favorite.favorite').findOne({
      where: {
        id: favId,
        user: user.id,
      },
      select: ['id'],
    });

    if (!fav) {
      return ctx.unauthorized('Môžete mazať len svoje vlastné obľúbené.');
    }

    const deleted = await strapi.entityService.delete('api::favorite.favorite', favId);

    ctx.body = { data: deleted };
  },
}));