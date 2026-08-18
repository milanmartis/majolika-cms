/**
 * Nájde objednávky, ktoré už majú vytvorenú Packeta zásielku (packeta_shipment_id).
 * Len ČÍTA. node scripts/check-packeta-shipments.cjs
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
    const r = await client.query(`
      SELECT id, customer_name, packeta_shipment_id, packeta_tracking_number, created_at
      FROM orders
      WHERE packeta_shipment_id IS NOT NULL AND btrim(packeta_shipment_id) <> ''
      ORDER BY id DESC
      LIMIT 20
    `);
    console.log(`\n=== Objednávky s Packeta zásielkou (packeta_shipment_id) ===`);
    console.log(`Nájdených: ${r.rows.length}\n`);
    for (const o of r.rows) {
      const d = o.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : '?';
      console.log(`  #${o.id}  ${d}  shipmentId=${o.packeta_shipment_id}  tracking=${o.packeta_tracking_number || '-'}  ${String(o.customer_name || '').slice(0, 20)}`);
    }
    if (!r.rows.length) {
      console.log('  Žiadna objednávka nemá v CMS uloženú Packeta zásielku.');
      console.log('  → Na test štítka odošli jednu reálnu objednávku cez admin tlačidlo „Ship with Packeta" (teraz už ID uloží), potom skús štítok.');
    } else {
      console.log(`\n→ Na test štítka použi ID zhora, napr. otvor: /api/orders/${r.rows[0].id}/packeta/label`);
    }
    console.log('');
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error('Chyba:', e); process.exit(1); });
