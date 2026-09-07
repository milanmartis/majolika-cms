/**
 * Nájde SKUTOČNÉ duplicitné poukážky = kde počet poukážok na order_item_id
 * PREVYŠUJE množstvo (quantity) danej položky. Legitímne qty-2+ nákupy NEoznačí.
 * Len ČÍTA. node scripts/find-duplicate-vouchers.cjs
 *
 * quantity sa berie z meta.sourceItem.quantity (fallback 1).
 * V skupine sa ponechá prvých `quantity` poukážok (najnižšie id), zvyšok = duplikát.
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

// vráti mapu order_item_id -> { itemQty, vouchers:[...], excessIds:[...] }
async function findGroups(client) {
  const q = await client.query(`
    WITH ranked AS (
      SELECT gv.id, gv.code, gv.status, gv.order_item_id, gv.customer_name, gv.amount,
             gv.used_at, gv.created_at,
             gv.meta ->> 'sourceOrderId' AS source_order_id,
             COALESCE(NULLIF(gv.meta -> 'sourceItem' ->> 'quantity', '')::int, 1) AS item_qty,
             ROW_NUMBER() OVER (PARTITION BY gv.order_item_id ORDER BY gv.id) AS rn,
             COUNT(*)   OVER (PARTITION BY gv.order_item_id) AS cnt
      FROM gift_vouchers gv
      WHERE gv.order_item_id IS NOT NULL AND btrim(gv.order_item_id) <> ''
    )
    SELECT * FROM ranked
    WHERE cnt > item_qty
    ORDER BY order_item_id, id
  `);
  const groups = {};
  for (const r of q.rows) {
    (groups[r.order_item_id] ||= { itemQty: r.item_qty, sourceOrderId: r.source_order_id, customer: r.customer_name, rows: [] }).rows.push(r);
  }
  return groups;
}

async function main() {
  const client = makeClient();
  await client.connect();
  try {
    const groups = await findGroups(client);
    const keys = Object.keys(groups);
    console.log(`\n=== Skupiny s počtom poukážok > quantity: ${keys.length} ===\n`);

    let excessIds = [];
    let usedExcess = [];
    for (const k of keys) {
      const g = groups[k];
      console.log(`── item_id=${k}  qty=${g.itemQty}  poukážok=${g.rows.length}  (${g.customer || '-'}, order=${g.sourceOrderId || '-'})`);
      g.rows.forEach((r, idx) => {
        const keep = idx < g.itemQty; // prvých qty ponecháme
        const t = r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19) : '?';
        const usedFlag = (r.status === 'used' || r.used_at) ? '  🔴 POUŽITÁ' : '';
        console.log(`     id=${r.id}  ${r.code}  status=${r.status}  amount=${r.amount}  ${t}  → ${keep ? 'PONECHAŤ' : 'DUPLIKÁT'}${usedFlag}`);
        if (!keep) {
          excessIds.push(r.id);
          if (r.status === 'used' || r.used_at) usedExcess.push(r.id);
        }
      });
      console.log('');
    }

    console.log(`=== SÚHRN ===`);
    console.log(`Skutočných duplikátov na zrušenie: ${excessIds.length}`);
    if (excessIds.length) console.log(`IDs: ${excessIds.join(', ')}`);
    if (usedExcess.length) console.log(`🔴 POZOR – z toho POUŽITÉ (rieš ručne, cancel ich preskočí): ${usedExcess.join(', ')}`);
    console.log(`\nNič sa nezmenilo (len čítanie). Cancel skript použije rovnakú logiku.\n`);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error('Chyba:', e); process.exit(1); });
