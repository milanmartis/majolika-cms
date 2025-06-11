/**
 * Script to import categories and product-category relations into Strapi (v4) via CommonJS.
 *
 * Place this file as `scripts/import-categories-products.cjs` so Node treats it as CJS even if your project uses ESM.
 *
 * Usage:
 *   1. In your Strapi project root, create a `scripts/` folder and put two CSVs in `scripts/data/`:
 *       - `categories.csv` (pipe-separated: term_id|category_name|category_slug|parent_term_id|...)
 *       - `products_in_categories.csv` (pipe-separated: externalId|subcategories(comma)|parentcategories(comma))
 *   2. Install the CSV parser:
 *        npm install csv-parser
 *   3. Run with Node (forced CJS):
 *        node scripts/import-categories-products.cjs
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
// Require Strapi bootstrap factory directly (CJS)
const Strapi = require('@strapi/strapi');

async function bootstrap() {
  // Launch Strapi in-process
  const strapi = await Strapi().load();

  // --- IMPORT CATEGORIES ---
  const categoriesCsv = path.resolve(__dirname, 'data/categories.csv');
  const categories = [];

  fs.createReadStream(categoriesCsv)
    .pipe(csv({ separator: '|', headers: ['term_id','category_name','category_slug','parent_term_id','parent_name'] }))
    .on('data', row => {
      categories.push({
        term_id: +row.term_id,
        category_name: row.category_name,
        category_slug: row.category_slug,
        parent_term_id: +row.parent_term_id,
      });
    })
    .on('end', async () => {
      console.log(`Loaded ${categories.length} categories`);

      const termToId = {};
      // Create root categories
      for (const cat of categories.filter(c => c.parent_term_id === 0)) {
        const entry = await strapi.entityService.create('api::category.category', { data: {
          term_id: cat.term_id,
          category_name: cat.category_name,
          category_slug: cat.category_slug,
        }});
        termToId[cat.term_id] = entry.id;
      }

      // Create child categories
      for (const cat of categories.filter(c => c.parent_term_id !== 0)) {
        const parentId = termToId[cat.parent_term_id];
        if (!parentId) console.warn(`Missing parent for term_id=${cat.term_id}`);
        const entry = await strapi.entityService.create('api::category.category', { data: {
          term_id: cat.term_id,
          category_name: cat.category_name,
          category_slug: cat.category_slug,
          parent: parentId,
        }});
        termToId[cat.term_id] = entry.id;
      }
      console.log('Categories import complete');

      // --- IMPORT PRODUCT-CATEGORY RELATIONS ---
      const prodCsv = path.resolve(__dirname, 'data/products_in_categories.csv');
      fs.createReadStream(prodCsv)
        .pipe(csv({ separator: '|', headers: ['externalId','subcategories','parentcategories'] }))
        .on('data', async row => {
          const externalId = +row.externalId;
          const subs = row.subcategories.split(',').map(x=>+x).filter(x=>termToId[x]);
          const parents = row.parentcategories.split(',').map(x=>+x).filter(x=>termToId[x]);
          const all = Array.from(new Set([...subs, ...parents]));
          if (!all.length) return;

          const products = await strapi.entityService.findMany('api::product.product', {
            filters: { externalId }, select: ['id'],
          });
          if (!products.length) return console.warn(`No product for externalId=${externalId}`);

          await strapi.entityService.update('api::product.product', products[0].id, { data: {
            categories: all.map(id => ({ id: termToId[id] })),
          }});
        })
        .on('end', () => {
          console.log('Product-category linking complete');
          strapi.destroy();
        });
    });
}

bootstrap().catch(err => {
  console.error('Import script failed:', err);
  process.exit(1);
});
