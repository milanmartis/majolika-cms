/**
 * Nájde duplicitné darčekové poukážky (dôsledok race condition pri potvrdení platby).
 * Len ČÍTA. node scripts/find-duplicate-vouchers.cjs
 *
 * Zoskupuje podľa order_item_id (identita položky) aj podľa meta.sourceOrderId (objednávka).
 * Poukážky s rovnakým order_item_id = tá istá položka → viac poukážok = podozrivý duplikát.
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
    // Diagnostika
    const diag = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE order_item_id IS NOT NULL AND btrim(order_item_id) <> '') AS s_item_id,
        COUNT(*) FILTER (WHERE source_order_invoice_number IS NOT NULL AND btrim(source_order_invoice_number) <> '') AS s_invoice,
        COUNT(*) FILTER (WHERE meta ->> 'sourceOrderId' IS NOT NULL) AS s_source_order_id
      FROM gift_vouchers
    `);
    const d = diag.rows[0];
    console.log(`\n=== Diagnostika poukážok ===`);
    console.log(`Spolu: ${d.total} | s order_item_id: ${d.s_item_id} | s invoice: ${d.s_invoice} | s meta.sourceOrderId: ${d.s_source_order_id}\n`);

    async function reportGroups(keyExpr, label) {
      const q = await client.query(`
        WITH dupes AS (
          SELECT ${keyExpr} AS k
          FROM gift_vouchers
          WHERE ${keyExpr} IS NOT NULL AND btrim(${keyExpr}::text) <> ''
          GROUP BY ${keyExpr}
          HAVING COUNT(*) > 1
        )
        SELECT gv.id, gv.code, gv.status, gv.order_item_id, gv.customer_name,
               gv.meta ->> 'sourceOrderId' AS source_order_id,
               gv.source_order_invoice_number AS invoice, gv.amount, gv.created_at,
               ${keyExpr} AS grp
        FROM gift_vouchers gv
        JOIN dupes ON dupes.k = ${keyExpr}
        ORDER BY grp, gv.id
      `);
      const byGrp = {};
      for (const r of q.rows) (byGrp[r.grp] ||= []).push(r);
      const grps = Object.keys(byGrp);
      console.log(`\n===== Zoskupené podľa: ${label} — skupín s 2+: ${grps.length} =====`);
      const suspects = [];
      for (const g of grps) {
        const rows = byGrp[g];
        console.log(`\n── ${label}=${g}  (${rows[0].customer_name || '-'})`);
        for (const r of rows) {
          const t = r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19) : '?';
          console.log(`     id=${r.id}  ${r.code}  status=${r.status}  itemId=${r.order_item_id || '-'}  order=${r.source_order_id || '-'}  amount=${r.amount}  ${t}`);
        }
        // navrhni na zrušenie: ponechaj najnižšie id, ostatné = duplikáty
        const sorted = rows.slice().sort((a, b) => a.id - b.id);
        suspects.push(...sorted.slice(1).map((x) => x.id));
      }
      return suspects;
    }

    const byItem = await reportGroups(`order_item_id`, 'order_item_id');
    const byOrder = await reportGroups(`meta ->> 'sourceOrderId'`, 'meta.sourceOrderId');

    const allSuspects = Array.from(new Set([...byItem, ...byOrder])).sort((a, b) => a - b);
    console.log(`\n=== SÚHRN ===`);
    console.log(`Duplikáty navrhnuté na zrušenie (ponechá sa vždy najnižšie id v skupine): ${allSuspects.length}`);
    if (allSuspects.length) console.log(`IDs: ${allSuspects.join(', ')}`);
    console.log(`\nNič sa nezmenilo (len čítanie).\n`);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error('Chyba:', e); process.exit(1); });
