import path from 'path';

export default {
  async run(ctx) {
    const token = ctx.request.headers['x-import-token'];
    const expectedToken = process.env.MODRANSKA_IMPORT_TOKEN;

    if (!expectedToken || token !== expectedToken) {
      ctx.status = 403;
      ctx.body = { ok: false, error: 'Forbidden' };
      return;
    }

    const start = Number(ctx.request.query.start ?? 0);
    const limit = Number(ctx.request.query.limit ?? 1);

    try {
      strapi.log.info(`=== MANUAL MODRANSKA IMPORT START start=${start} limit=${limit} ===`);

      const importerPath = path.join(process.cwd(), 'scripts', 'import-modranska.js');
      delete require.cache[require.resolve(importerPath)];
      const runImporter = require(importerPath);

      const result = await runImporter(strapi, { start, limit });

      strapi.log.info(`=== MANUAL MODRANSKA IMPORT FINISHED start=${start} limit=${limit} ===`);

      ctx.body = {
        ok: true,
        start,
        limit,
        result,
      };
    } catch (error) {
      strapi.log.error('=== MANUAL MODRANSKA IMPORT FAILED ===');
      strapi.log.error(error instanceof Error ? error.stack : String(error));

      ctx.status = 500;
      ctx.body = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async fixCategories(ctx) {
    const token = ctx.request.headers['x-import-token'];
    const expectedToken = process.env.MODRANSKA_IMPORT_TOKEN;

    if (!expectedToken || token !== expectedToken) {
      ctx.status = 403;
      ctx.body = { ok: false, error: 'Forbidden' };
      return;
    }

    const start = Number(ctx.request.query.start ?? 0);
    const limit = Number(ctx.request.query.limit ?? 50);

    try {
      strapi.log.info(`=== MODRANSKA FIX CATEGORIES START start=${start} limit=${limit} ===`);

      const products = await strapi.db.query('api::product.product').findMany({
        where: { locale: 'sk' },
        orderBy: { id: 'asc' },
        offset: start,
        limit,
        select: ['id', 'name', 'slug', 'category'],
        populate: {
          categories: {
            select: ['id', 'category_name'],
          },
        },
      });

      let updated = 0;
      let skippedNoCategoryText = 0;
      let skippedAlreadyAssigned = 0;
      let skippedCategoryNotFound = 0;

      for (const product of products) {
        const categoryText = String(product.category || '').trim();

        strapi.log.info(
          `[FIX CATEGORIES] Product id=${product.id} slug=${product.slug} category="${categoryText}"`
        );

        if (!categoryText) {
          skippedNoCategoryText++;
          continue;
        }

        if (product.categories && product.categories.length > 0) {
          skippedAlreadyAssigned++;
          continue;
        }

        const categoryRow = await strapi.db.query('api::category.category').findOne({
          where: { category_name: categoryText },
          select: ['id', 'category_name'],
        });

        if (!categoryRow) {
          skippedCategoryNotFound++;
          strapi.log.warn(
            `[FIX CATEGORIES] Category not found for product id=${product.id}: "${categoryText}"`
          );
          continue;
        }

        await strapi.db.query('api::product.product').update({
          where: { id: product.id },
          data: {
            categories: [categoryRow.id],
          },
        });

        updated++;

        strapi.log.info(
          `[FIX CATEGORIES] Attached category id=${categoryRow.id} to product id=${product.id}`
        );
      }

      strapi.log.info(`=== MODRANSKA FIX CATEGORIES END start=${start} limit=${limit} ===`);

      ctx.body = {
        ok: true,
        start,
        limit,
        processed: products.length,
        updated,
        skippedNoCategoryText,
        skippedAlreadyAssigned,
        skippedCategoryNotFound,
      };
    } catch (error) {
      strapi.log.error('=== MODRANSKA FIX CATEGORIES FAILED ===');
      strapi.log.error(error instanceof Error ? error.stack : String(error));

      ctx.status = 500;
      ctx.body = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};