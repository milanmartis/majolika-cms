/**
 * Zruší (status = 'cancelled') SKUTOČNÉ duplicitné poukážky = nadbytok nad quantity položky.
 * Rovnaká detekcia ako find-duplicate-vouchers.cjs. Ruší len 'active' (použité preskočí).
 *
 *   node scripts/cancel-duplicate-vouchers.cjs            # DRY-RUN
 *   node scripts/cancel-duplicate-vouchers.cjs --apply    # zruší + záloha
 *   node scripts/cancel-duplicate-vouchers.cjs --restore=scripts/backups/vouchers-cancel-XXXX.json
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const restoreArg = process.argv.find((a) => a.startsWith('--restore='));
const RESTORE_FILE = restoreArg ? restoreArg.split('=').slice(1).join('=') : null;

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

// nadbytočné poukážky = v skupine order_item_id nad rámec quantity (rn > qty)
async function findExcess(client) {
  const q = await client.query(`
    WITH ranked AS (
      SELECT gv.id, gv.code, gv.status, gv.order_item_id, gv.customer_name, gv.amount, gv.used_at, gv.cancelled_at,
             COALESCE(NULLIF(gv.meta -> 'sourceItem' ->> 'quantity', '')::int, 1) AS item_qty,
             ROW_NUMBER() OVER (PARTITION BY gv.order_item_id ORDER BY gv.id) AS rn,
             COUNT(*)   OVER (PARTITION BY gv.order_item_id) AS cnt
      FROM gift_vouchers gv
      WHERE gv.order_item_id IS NOT NULL AND btrim(gv.order_item_id) <> ''
    )
    SELECT * FROM ranked WHERE cnt > item_qty AND rn > item_qty ORDER BY id
  `);
  return q.rows;
}

async function restore(client) {
  console.log(`\n♻️  RESTORE zo zálohy: ${RESTORE_FILE}\n`);
  const rows = JSON.parse(fs.readFileSync(path.resolve(RESTORE_FILE), 'utf8'));
  let ok = 0;
  for (const r of rows) {
    await client.query(`UPDATE gift_vouchers SET status = $1, cancelled_at = $2 WHERE id = $3`, [r.status, r.cancelled_at, r.id]);
    ok++;
  }
  console.log(`Restore hotový: ✅ ${ok}\n`);
}

async function main() {
  const client = makeClient();
  await client.connect();
  try {
    if (RESTORE_FILE) { await restore(client); return; }

    const excess = await findExcess(client);
    console.log(`\n${APPLY ? '✍️  RUŠENIE DUPLIKÁTOV' : '🔎 DRY-RUN (nič sa nezmení)'}  – nadbytočných poukážok: ${excess.length}\n`);

    const toCancel = [];
    let used = 0;
    for (const v of excess) {
      if (v.status === 'used' || v.used_at) {
        used++;
        console.log(`  id=${v.id}  ${v.code}  🔴 POUŽITÁ (status=${v.status}, used_at=${v.used_at || '-'}) → PRESKOČENÉ, rieš ručne`);
        continue;
      }
      if (v.status !== 'active') { console.log(`  id=${v.id}  ${v.code}  ⚠️ status=${v.status} → PRESKOČENÉ`); continue; }
      console.log(`  id=${v.id}  ${v.code}  ${v.customer_name || '-'}  amount=${v.amount}  → zruším`);
      toCancel.push(v);
    }

    console.log(`\n🔴 Použitých: ${used}  |  Na zrušenie (nepoužité active): ${toCancel.length}`);

    if (!APPLY) { console.log('\nDry-run hotový. Pre reálne zrušenie pridaj --apply.\n'); return; }
    if (!toCancel.length) { console.log('\nNiet čo rušiť.\n'); return; }

    const backupsDir = path.resolve(__dirname, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupsDir, `vouchers-cancel-${stamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(toCancel.map((v) => ({ id: v.id, status: v.status, cancelled_at: v.cancelled_at })), null, 2), 'utf8');
    console.log(`\n💾 Záloha: ${backupFile}`);

    const now = new Date().toISOString();
    let ok = 0;
    for (const v of toCancel) {
      await client.query(`UPDATE gift_vouchers SET status = 'cancelled', cancelled_at = $1 WHERE id = $2 AND status = 'active'`, [now, v.id]);
      ok++;
    }
    console.log(`\nHotovo: ✅ ${ok} zrušených.`);
    console.log(`Návrat: node scripts/cancel-duplicate-vouchers.cjs --restore=${path.relative(process.cwd(), backupFile)}\n`);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error('Chyba:', e); process.exit(1); });
