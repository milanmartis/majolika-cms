/**
 * Rýchla kontrola: majú Packeta (packeta_box) objednávky vyplnený telefón?
 * Pripája sa priamo na Postgres (pg + DATABASE_URL z .env). Len ČÍTA, nič nemení.
 *
 *   node scripts/check-packeta-phone.cjs
 */
'use strict';
require('dotenv').config();
const { Client } = require('pg');

function makeClient() {
  const useSsl = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true';
  const ssl = useSsl
    ? { rejectUnauthorized: String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' }
    : false;
  if (process.env.DATABASE_URL) return new Client({ connectionString: process.env.DATABASE_URL, ssl });
  return new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME || 'strapi',
    user: process.env.DATABASE_USERNAME || 'strapi',
    password: process.env.DATABASE_PASSWORD || 'strapi',
    ssl,
  });
}

async function main() {
  const client = makeClient();
  await client.connect();
  try {
    const summary = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE customer_phone IS NULL OR btrim(customer_phone) = '') AS bez_telefonu,
        COUNT(*) FILTER (WHERE customer_phone IS NOT NULL AND btrim(customer_phone) <> '') AS s_telefonom
      FROM orders
      WHERE delivery_method = 'packeta_box'
    `);
    const s = summary.rows[0];
    console.log('\n=== Packeta (packeta_box) objednávky ===');
    console.log(`Spolu:          ${s.total}`);
    console.log(`S telefónom:    ${s.s_telefonom}`);
    console.log(`BEZ telefónu:   ${s.bez_telefonu}  ${Number(s.bez_telefonu) > 0 ? '⚠️' : '✓'}`);

    const recent = await client.query(`
      SELECT id, customer_name, customer_phone, created_at
      FROM orders
      WHERE delivery_method = 'packeta_box'
      ORDER BY id DESC
      LIMIT 15
    `);
    console.log('\n=== Posledných 15 Packeta objednávok ===');
    for (const r of recent.rows) {
      const tel = r.customer_phone && String(r.customer_phone).trim() ? r.customer_phone : '❌ CHÝBA';
      console.log(`  #${r.id}  ${String(r.customer_name || '').slice(0, 25).padEnd(25)}  tel: ${tel}`);
    }

    if (Number(s.bez_telefonu) > 0) {
      const missing = await client.query(`
        SELECT id, customer_name, created_at
        FROM orders
        WHERE delivery_method = 'packeta_box'
          AND (customer_phone IS NULL OR btrim(customer_phone) = '')
        ORDER BY id DESC
      `);
      console.log('\n=== Packeta objednávky BEZ telefónu (id, meno, dátum) ===');
      for (const r of missing.rows) {
        const d = r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '?';
        console.log(`  #${r.id}  ${d}  ${String(r.customer_name || '').slice(0, 30)}`);
      }
    }

    if (Number(s.bez_telefonu) === 0) {
      console.log('\n✅ Všetky Packeta objednávky majú telefón → frontend ho posiela správne.');
    } else {
      console.log(`\n⚠️ ${s.bez_telefonu} Packeta objednávok je BEZ telefónu → tie sa cez Packetu neodošlú, kým telefón nedoplníš. A frontend by mal telefón vyžadovať.`);
    }
    console.log('');
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error('Chyba:', err); process.exit(1); });
