// scripts/import-wc-products.cjs
// Imports products from trimmed CSV into Strapi via REST API
// Maps fields: externalId,type,ean,name,public,price,category,tag,picture,variable
// Stores only raw picture URL string, does not upload media

require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { parse } = require('csv-parse');

// Config from .env
// Ensure Strapi is running: `npm run develop` (default on 127.0.0.1:1337) or set STRAPI_URL
const STRAPI_URL = process.env.STRAPI_URL || 'http://127.0.0.1:1337';
const TOKEN = process.env.STRAPI_TOKEN;
if (!TOKEN) {
  console.error('Error: STRAPI_TOKEN not set in .env');
  process.exit(1);
}

(async () => {
  // Quick connectivity check
  try {
    await axios.get(`${STRAPI_URL}/api/products`);
  } catch (err) {
    console.error(`Cannot connect to Strapi at ${STRAPI_URL}. Please ensure it's running.`);
    process.exit(1);
  }

  const csvPath = './scripts/wc-product-export-15-5-2025.csv';
  const parser = fs.createReadStream(csvPath)
    .pipe(parse({ columns: true, skip_empty_lines: true, relax_quotes: true }));

  // parentMap will hold identifiers (externalId, ean, variable) -> Strapi record ID
  const parentMap = {};
  const variations = [];

  for await (const row of parser) {
    const externalId = parseInt(row.externalId, 10);
    const type = row.type;
    const isVariable = type === 'variable';
    const isVariation = type === 'variation';

    const data = {
      externalId,
      type,
      ean: row.ean || null,
      name: row.name,
      public: row.public === '1',
      price: row.price ? parseFloat(row.price) : null,
      category: row.category || null,
      tag: row.tag || null,
      variable: row.variable || null,
      picture: row.picture || null
    };
    const payload = { data };

    if (isVariable) {
      try {
        const res = await axios.post(
          `${STRAPI_URL}/api/products`,
          payload,
          { headers: { Authorization: `Bearer ${TOKEN}` } }
        );
        const recordId = res.data.data.id;
        // Map externalId, ean and variable code to this new record
        parentMap[externalId] = recordId;
        if (row.ean) parentMap[row.ean] = recordId;
        if (row.variable) parentMap[row.variable] = recordId;
        console.log(`Variable created: ${data.name} (ID ${recordId})`);
      } catch (e) {
        console.error(`Failed to create variable ${data.name}: ${e.message}`);
      }
    } else if (isVariation) {
      variations.push({ row, payload });
    } else {
      try {
        const res = await axios.post(
          `${STRAPI_URL}/api/products`,
          payload,
          { headers: { Authorization: `Bearer ${TOKEN}` } }
        );
        console.log(`Simple created: ${data.name} (ID ${res.data.data.id})`);
      } catch (e) {
        console.error(`Failed to create simple ${data.name}: ${e.message}`);
      }
    }
  }

  // Process variations: identify parent by variable code, ean or externalId
  for (const { row, payload } of variations) {
    const key = row.variable || row.ean || parseInt(row.externalId, 10);
    const parentId = parentMap[key];
    if (!parentId) {
      console.warn(`Parent not found for variation externalId=${row.externalId}, key=${key}`);
      continue;
    }
    payload.data.parent = parentId;
    try {
      const res = await axios.post(
        `${STRAPI_URL}/api/products`,
        payload,
        { headers: { Authorization: `Bearer ${TOKEN}` } }
      );
      console.log(`Variation created: ${payload.data.name} under parent ${parentId}`);
    } catch (e) {
      console.error(`Failed to create variation ${payload.data.name}: ${e.message}`);
    }
  }

  console.log('🎉 Import complete!');
})();