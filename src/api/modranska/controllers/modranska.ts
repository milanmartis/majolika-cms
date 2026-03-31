import path from 'path';

export default {
  async run(ctx) {
    try {
      strapi.log.info('=== MANUAL MODRANSKA IMPORT START ===');

      const importerPath = path.join(process.cwd(), 'scripts', 'import-modranska.js');
      const runImporter = require(importerPath);

      await runImporter(strapi);

      strapi.log.info('=== MANUAL MODRANSKA IMPORT FINISHED ===');

      ctx.body = {
        ok: true,
        message: 'Import finished',
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