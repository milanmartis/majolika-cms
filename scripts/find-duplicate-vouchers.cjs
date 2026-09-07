/**
 * Nájde duplicitné darčekové poukážky (dôsledok race condition pri potvrdení platby).
 * Len ČÍTA. node scripts/find-duplicate-vouchers.cjs
 *
 * Logika: vypíše objednávky (podľa source_order_invoice_number), ktoré majú 2+ poukážok,
 * a označí ako PODOZRIVÝ DUPLIKÁT tie, kde viac poukážok zdieľa rovnaké order_item_id
 * (tzn. na tú istú položku vzniklo viac poukážok — typický príznak race-u).
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
    const res = await client.query(`
      WITH dupes AS (
        SELECT source_order_invoice_number AS inv
        FROM gift_vouchers
        WHERE source_order_invoice_number IS NOT NULL AND btrim(source_order_invoice_number) <> ''
        GROUP BY source_order_invoice_number
        HAVING COUNT(*) > 1
      )
      SELECT gv.id, gv.code, gv.status, gv.order_item_id, gv.customer_name,
             gv.source_order_invoice_number AS invoice, gv.amount, gv.created_at
      FROM gift_vouchers gv
      JOIN dupes ON dupes.inv = gv.source_order_invoice_number
      ORDER BY gv.source_order_invoice_number, gv.id
    `);

    // zoskup podľa faktúry
    const byInvoice = {};
    for (const r of res.rows) {
      (byInvoice[r.invoice] ||= []).push(r);
    }

    const invoices = Object.keys(byInvoice);
    let suspectCount = 0;
    let suspectVoucherIds = [];

    console.log(`\n=== Objednávky s 2+ poukážkami: ${invoices.length} ===\n`);

    for (const inv of invoices) {
      const rows = byInvoice[inv];
      // spočítaj poukážky na order_item_id
      const perItem = {};
      for (const r of rows) {
        const key = r.order_item_id || '(null)';
        (perItem[key] ||= []).push(r);
      }
      const hasDup = Object.values(perItem).some((arr) => arr.length > 1);

      console.log(`── Faktúra ${inv}  (${rows[0].customer_name || '-'})  ${hasDup ? '⚠️ PODOZRIVÝ DUPLIKÁT' : '(rôzne položky – asi OK)'}`);
      for (const r of rows) {
        const d = r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19) : '?';
        console.log(`     id=${r.id}  ${r.code}  status=${r.status}  itemId=${r.order_item_id || '-'}  amount=${r.amount}  ${d}`);
      }
      if (hasDup) {
        suspectCount++;
        // navrhni na zrušenie: v každej skupine rovnakého itemId nechaj najnižšie id, ostatné zruš
        for (const arr of Object.values(perItem)) {
          if (arr.length > 1) {
            const sorted = arr.slice().sort((a, b) => a.id - b.id);
            suspectVoucherIds.push(...sorted.slice(1).map((x) => x.id)); // ponechaj prvé, ostatné = duplikáty
          }
        }
      }
      console.log('');
    }

    console.log(`\n=== SÚHRN ===`);
    console.log(`Objednávok s podozrivým duplikátom: ${suspectCount}`);
    console.log(`Poukážky navrhnuté na zrušenie (ponechá sa vždy najnižšie id na položku): ${suspectVoucherIds.length}`);
    if (suspectVoucherIds.length) {
      console.log(`IDs duplikátov: ${suspectVoucherIds.join(', ')}`);
    }
    console.log('\nNič sa nezmenilo (len čítanie). Zrušenie duplikátov spravíme až po tvojom potvrdení.\n');
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error('Chyba:', e); process.exit(1); });
