// src/api/product/controllers/product.ts
import { factories } from '@strapi/strapi';

const productPopulate = {
  picture_new: true,
  pictures_new: true,
  categories: { populate: { parent: true } },
  dekory: true,
  tvar: true,
  variations: {
    populate: {
      picture_new: true,
      pictures_new: true,
      categories: { populate: { parent: true } },
      dekory: true,
      tvar: true,
    },
  },
};

function getLocaleFromCtx(ctx: any): string | undefined {
  return (ctx.query as any)?.locale ?? (ctx.state as any)?.locale ?? undefined;
}

// ✅ helper mimo controller (nebude to ControllerHandler)
async function resolveProductIdFromDocument(strapi: any, ctx: any): Promise<number> {
  const { documentId } = ctx.params as { documentId: string };
  const locale = getLocaleFromCtx(ctx) || 'sk';

  if (!documentId) ctx.throw(400, 'Missing documentId');

  const rows = await strapi.entityService.findMany('api::product.product', {
    filters: { documentId: { $eq: documentId } } as any,
    locale,
    fields: ['id', 'documentId', 'locale', 'slug'] as any,
    limit: 1,
  });

  const hit = Array.isArray(rows) ? rows[0] : (rows as any);
  if (!hit?.id) ctx.throw(404, 'Product not found for documentId/locale');

  return hit.id as number;
}

export default factories.createCoreController('api::product.product', ({ strapi }) => ({

  async find(ctx: any, next: any) {
    ctx.query = { ...ctx.query, populate: productPopulate };
    return super.find(ctx, next);
  },

  async findOne(ctx: any, next: any) {
    ctx.query = { ...ctx.query, populate: productPopulate };
    return super.findOne(ctx, next);
  },

  async findByCategory(ctx: any, _next: any) {
    const { slug } = ctx.params as { slug: string };
    const locale = getLocaleFromCtx(ctx);

    const dekoryRaw = (ctx.query as any)?.dekory;
    const tvaryRaw  = (ctx.query as any)?.tvary;

    const dekory: string[] =
      typeof dekoryRaw === 'string' && dekoryRaw.length > 0 ? dekoryRaw.split(',') : [];
    const tvary: string[] =
      typeof tvaryRaw === 'string' && tvaryRaw.length > 0 ? tvaryRaw.split(',') : [];

    const pagination = (ctx.query as any)?.pagination;
    const sort       = (ctx.query as any)?.sort;

    const categories = await strapi.entityService.findMany('api::category.category', {
      filters: { category_slug: { $eq: slug } },
      fields: ['id'],
      locale,
      limit: 1,
    });

    const category = Array.isArray(categories) ? categories[0] : (categories as any);
    if (!category?.id) return ctx.send({ data: [] });

    const baseFilter: any = { categories: { id: category.id }, public: true };

    if (!dekory.length && !tvary.length) {
      const all = await strapi.entityService.findMany('api::product.product', {
        filters: baseFilter,
        populate: productPopulate,
        locale,
        ...(pagination ? { pagination } : {}),
        ...(sort ? { sort } : {}),
      });
      return ctx.send({ data: all });
    }

    const orFilters: any[] = [];

    dekory.forEach((slugVal) => {
      orFilters.push({ dekory: { slug: { $eqi: slugVal } } });
      orFilters.push({ variations: { dekory: { slug: { $eqi: slugVal } } } });
    });

    tvary.forEach((slugVal) => {
      orFilters.push({ tvar: { slug: { $eqi: slugVal } } });
      orFilters.push({ variations: { tvar: { slug: { $eqi: slugVal } } } });
    });

    const products = await strapi.entityService.findMany('api::product.product', {
      filters: { ...baseFilter, ...(orFilters.length ? { $or: orFilters } : {}) },
      populate: productPopulate,
      locale,
      ...(pagination ? { pagination } : {}),
      ...(sort ? { sort } : {}),
    });

    return ctx.send({ data: products });
  },

  // ============================================================
  // ✅ CANONICAL endpoints: /products/by-document/:documentId/...
  // ============================================================
  async eventSessionsByDocument(ctx: any, next: any) {
    const productId = await resolveProductIdFromDocument(strapi, ctx);
    ctx.params.id = String(productId);
    return this.eventSessions(ctx, next);
  },

  async bookEventSessionByDocument(ctx: any, next: any) {
    const productId = await resolveProductIdFromDocument(strapi, ctx);
    ctx.params.id = String(productId);
    return this.bookEventSession(ctx, next);
  },

  async confirmPaidBookingByDocument(ctx: any, next: any) {
    const productId = await resolveProductIdFromDocument(strapi, ctx);
    ctx.params.id = String(productId);
    return this.confirmPaidBooking(ctx, next);
  },

  async cancelBookingByDocument(ctx: any, next: any) {
    const productId = await resolveProductIdFromDocument(strapi, ctx);
    ctx.params.id = String(productId);
    return this.cancelBooking(ctx, next);
  },

  // ============================================================
  // ✅ LEGACY endpoints: deleguj do service (posuň aj next)
  // ============================================================
  async eventSessions(ctx: any, next: any) {
    const svc = strapi.service('api::product.product') as any;
    if (!svc?.eventSessions) return ctx.throw(501, 'Service product.eventSessions nie je implementované');
    return svc.eventSessions(ctx, next);
  },

  async bookEventSession(ctx: any, next: any) {
    const svc = strapi.service('api::product.product') as any;
    if (!svc?.bookEventSession) return ctx.throw(501, 'Service product.bookEventSession nie je implementované');
    return svc.bookEventSession(ctx, next);
  },

  async confirmPaidBooking(ctx: any, next: any) {
    const svc = strapi.service('api::product.product') as any;
    if (!svc?.confirmPaidBooking) return ctx.throw(501, 'Service product.confirmPaidBooking nie je implementované');
    return svc.confirmPaidBooking(ctx, next);
  },

  async cancelBooking(ctx: any, next: any) {
    const svc = strapi.service('api::product.product') as any;
    if (!svc?.cancelBooking) return ctx.throw(501, 'Service product.cancelBooking nie je implementované');
    return svc.cancelBooking(ctx, next);
  },

}));