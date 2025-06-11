// scripts/import-categories.js

const path    = require('path');
const fs      = require('fs');
const { parse } = require('csv-parse/sync');
const { createStrapi } = require('@strapi/strapi');

async function run() {
  // 1) Spustíme Strapi
  let strapi;
  try {
    strapi = await createStrapi({ distDir: path.resolve(__dirname, '../dist') });
    await strapi.load();
    console.log('✅ Strapi loaded (bootstrap ran)');
  } catch (err) {
    console.error('❌ Chyba pri spúšťaní Strapi:', err);
    process.exit(1);
  }

  // 2) Cesty k CSV (uprav, ak ich máš inde)
  const catsCsvFile   = path.join(__dirname, 'categories.csv');
  const pivotCsvFile  = path.join(__dirname, 'products_in_categories.csv');

  if (!fs.existsSync(catsCsvFile) || !fs.existsSync(pivotCsvFile)) {
    console.error('❌ CSV súbory nenašli. Skontroluj cestu a názvy.');
    process.exit(1);
  }

  // 3) Načítanie a parsovanie CSV
  const catsCsv = fs.readFileSync(catsCsvFile, 'utf8');
  const pivCsv  = fs.readFileSync(pivotCsvFile, 'utf8');

  const catRows = parse(catsCsv, { columns: true, skip_empty_lines: true })
    .map(r => ({
      term_id:        Number(r.term_id),
      category_name:  r.category_name,
      category_slug:  r.category_slug,
      parent_term_id: r.parent_term_id ? Number(r.parent_term_id) : null,
    }));

  const pivotRows = parse(pivCsv, { columns: true, skip_empty_lines: true })
    .map(r => ({
      product_id: Number(r.product_id),
      term_ids:   r.term_ids, // očakávame "1,2,3"
    }));

  // 4) Import produktov (externalId)
  console.log(`🔄 Importujem ${pivotRows.length} produktov…`);
  for (const { product_id } of pivotRows) {
    const [existing] = await strapi.entityService.findMany('api::product.product', {
      filters: { externalId: product_id },
    });
    if (!existing) {
      await strapi.entityService.create('api::product.product', {
        data: { externalId: product_id },
      });
    }
  }
  console.log('✅ Produkty importované');

  // 5) Import kategórií + parent vzťah
  console.log(`🔄 Importujem ${catRows.length} kategórií…`);
  const termToId = new Map();
  for (const { term_id, category_name, category_slug } of catRows) {
    let cat = await strapi.db.query('api::category.category').findOne({
      where: { term_id },
    });
    if (!cat) {
      cat = await strapi.entityService.create('api::category.category', {
        data: { term_id, category_name, category_slug },
      });
    }
    termToId.set(term_id, cat.id);
  }
  for (const { term_id, parent_term_id } of catRows) {
    if (!parent_term_id) continue;
    await strapi.entityService.update('api::category.category', {
      where: { id: termToId.get(term_id) },
      data:  { parent: termToId.get(parent_term_id) },
    });
  }
  console.log('✅ Kategórie importované');

  // 6) Import väzieb produkt–kategória
  console.log(`🔄 Importujem ${pivotRows.length} väzieb produkt–kategória…`);
  for (const { product_id, term_ids } of pivotRows) {
    const [prod] = await strapi.entityService.findMany('api::product.product', {
      filters: { externalId: product_id },
    });
    if (!prod || !term_ids) continue;

    const ids = term_ids
      .split(',')
      .map(s => +s.trim())
      .filter(n => termToId.has(n))
      .map(n => ({ id: termToId.get(n) }));

    if (ids.length) {
      await strapi.entityService.update('api::product.product', {
        where: { id: prod.id },
        data:  { categories: { set: ids } },
      });
    }
  }
  console.log('✅ Väzby produkt–kategória importované');

  // 7) (Voliteľné) Synchronizácia obrázkov z pola picture
  const prods = await strapi.db.query('api::product.product').findMany({ select: ['id', 'picture'] });
  console.log(`🔄 Synchronizujem obrázky pre ${prods.length} produktov…`);
  for (const { id, picture } of prods) {
    if (!picture || typeof picture !== 'string') continue;
    const urls = picture.split(',').map(u => u.trim()).filter(Boolean);
    const fileIds = [];
    for (const u of urls) {
      const fileName = (() => {
        try { return decodeURIComponent(new URL(u).pathname.split('/').pop()); }
        catch { return u.split('/').pop(); }
      })();
      const base = fileName.includes('_') ? fileName.split('_').pop() : fileName;
      const file = await strapi.db.query('plugin::upload.file').findOne({
        where: { name: { $endsWith: base } },
      });
      if (file) fileIds.push(file.id);
    }
    if (fileIds.length) {
      await strapi.entityService.update('api::product.product', {
        where: { id },
        data:  {
          picture_new:  fileIds[0],
          pictures_new: fileIds.slice(1).map(fid => ({ id: fid })),
        },
      });
    }
  }
  console.log('✅ Synchronizácia obrázkov dokončená');

  // 8) Ukončíme Strapi a proces
  await strapi.destroy();
  console.log('🛑 Strapi destroy completed');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Neočakávaná chyba:', err);
  process.exit(1);
});
