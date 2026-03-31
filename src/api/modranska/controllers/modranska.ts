import path from 'path';

export default {
  async run(ctx) {
    const token = ctx.request.headers['x-import-token'];
    const expectedToken = process.env.MODRANSKA_IMPORT_TOKEN;

    if (!expectedToken || token !== expectedToken) {
      ctx.status = 403;
      ctx.body = {
        ok: false,
        error: 'Forbidden',
      };
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
};