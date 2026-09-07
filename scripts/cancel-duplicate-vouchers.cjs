/**
 * Zruší (status = 'cancelled') duplicitné darčekové poukážky (dôsledok race pri platbe).
 * Ruší LEN presne zadané ID a LEN ak sú 'active' (použité/iné preskočí). So zálohou + restore.
 *
 *   node scripts/cancel-duplicate-vouchers.cjs            # DRY-RUN (nič nezmení)
 *   node scripts/cancel-duplicate-vouchers.cjs --apply    # zruší + záloha do scripts/backups/
 *   node scripts/cancel-duplicate-vouchers.cjs --restore=scripts/backups/vouchers-XXXX.json
 *
 * Overený zoznam duplikátov (ponechá sa vždy najnižšie id na order_item_id):
 *   35, 59, 68, 71, 73, 84, 85, 87, 89, 90, 91, 95, 96, 100, 103
 * (NEobsahuje 55 a 98 – to sú legitímne rôzne poukážky, nie duplikáty!)
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DEFAULT_IDS = [35, 59, 68, 71, 73, 84, 85, 87, 89, 90, 91, 95, 96, 100, 103];

const APPLY = process.argv.includes('--apply');
const restoreArg = process.argv.find((a) => a.startsWith('--restore='));
const RESTORE_FILE = restoreArg ? restoreArg.split('=').slice(1).join('=') : null;
const idsArg = process.argv.find((a) => a.startsWith('--ids='));
const IDS = idsArg
  ? idsArg.split('=')[1].split(',').map((s) => Number(s.trim())).filter(Number.isFinite)
  : DEFAULT_IDS;

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

    console.log(`\n${APPLY ? '✍️  RUŠENIE DUPLIKÁTOV' : '🔎 DRY-RUN (nič sa nezmení)'}  – ${IDS.length} poukážok\n`);

    const res = await client.query(
      `SELECT id, code, status, cancelled_at, used_at, used_by_order_invoice_number, customer_name, order_item_id, amount
       FROM gift_vouchers WHERE id = ANY($1::int[]) ORDER BY id`,
      [IDS]
    );
    const found = new Map(res.rows.map((r) => [r.id, r]));

    const toCancel = [];
    let usedCount = 0;
    for (const id of IDS) {
      const v = found.get(id);
      if (!v) { console.log(`  id=${id}  ❌ NENÁJDENÁ`); continue; }
      const wasUsed = v.status === 'used' || v.used_at;
      if (wasUsed) {
        usedCount++;
        console.log(`  id=${id}  ${v.code}  🔴 POUŽITÁ (status=${v.status}, used_at=${v.used_at || '-'}, order=${v.used_by_order_invoice_number || '-'}) → PRESKOČENÉ, rieš ručne!`);
        continue;
      }
      if (v.status !== 'active') { console.log(`  id=${id}  ${v.code}  ⚠️ status=${v.status} → PRESKOČENÉ (nie active)`); continue; }
      console.log(`  id=${id}  ${v.code}  ${v.customer_name || '-'}  amount=${v.amount}  → zruším`);
      toCancel.push(v);
    }
    console.log(`\n🔴 Použitých duplikátov: ${usedCount}  |  Na zrušenie (nepoužité active): ${toCancel.length}`);

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
