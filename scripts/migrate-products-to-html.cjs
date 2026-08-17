/**
 * Migrácia polí `short` a `describe` v Produktoch na čisté HTML (pre CKEditor).
 * Pripája sa priamo na Postgres (pg + DATABASE_URL). Bez TS buildu / bez Strapi.
 *
 *   # DRY-RUN (nič nezapíše, len štatistika + ukážky):
 *   node scripts/migrate-products-to-html.cjs
 *
 *   # test na prvých N riadkoch (odporúčam pred plným behom):
 *   node scripts/migrate-products-to-html.cjs --apply --limit=20
 *
 *   # plná migrácia (záloha do scripts/backups/, potom prepis):
 *   node scripts/migrate-products-to-html.cjs --apply
 *
 *   # návrat späť zo zálohy:
 *   node scripts/migrate-products-to-html.cjs --restore=scripts/backups/products-XXXX.json
 *
 * Čo robí:
 *   - Prázdne polia preskočí.
 *   - Obsah, ktorý UŽ je HTML, preskočí (idempotentné – nič sa nezmrví).
 *   - Plain / „literálne \n" prevedie: odstráni literálne \n, riadky → <p>…</p>.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { Client } = require('pg');

// rovnaké nastavenie ako pri migrácii aktualít (jednoduchý zlom riadku -> <br>, prázdny riadok -> nový odsek)
marked.setOptions({ gfm: true, breaks: true, mangle: false, headerIds: false });

const TABLE = process.env.MIGRATE_TABLE || 'products';
const COLUMNS = ['short', 'describe'];

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null;
const restoreArg = process.argv.find(a => a.startsWith('--restore='));
const RESTORE_FILE = restoreArg ? restoreArg.split('=').slice(1).join('=') : null;

function looksLikeHtml(s) {
  const v = String(s || '');
  return /<\/(p|h[1-6]|ul|ol|li|strong|em|a|blockquote|div|span|br)\b/i.test(v)
    || /<(p|h[1-6]|ul|ol|br|strong|em|li)\b[^>]*>/i.test(v);
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// plain / literalBN -> HTML (rovnako ako aktuality, cez marked)
function toHtml(raw) {
  let s = String(raw || '');
  s = s.replace(/\\r\\n|\\n|\\r/g, '\n'); // literálne \n / \r\n -> skutočný newline (= Enter)
  s = s.replace(/\n{3,}/g, '\n\n');       // 3+ prázdnych riadkov zredukuj na jeden odsek
  return String(marked.parse(s)).trim();
}
function needsConversion(c) {
  if (!c || !String(c).trim()) return false;
  if (looksLikeHtml(c)) return false;
  return true;
}

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
  let ok = 0, failed = 0;
  for (const r of rows) {
    try {
      await client.query(`UPDATE "${TABLE}" SET "short" = $1, "describe" = $2 WHERE id = $3`, [r.short, r.describe, r.id]);
      ok++;
    } catch (e) { console.log(`  ❌ id=${r.id}: ${e.message}`); failed++; }
  }
  console.log(`\nRestore hotový: ✅ ${ok}, ❌ ${failed}.`);
}

async function main() {
  const client = makeClient();
  await client.connect();
  try {
    if (RESTORE_FILE) { await restore(client); return; }

    console.log(`\n${APPLY ? '✍️  MIGRÁCIA' : '🔎 DRY-RUN'}  – "${TABLE}" (short, describe) → HTML${LIMIT ? `  [limit ${LIMIT}]` : ''}\n`);

    const res = await client.query(`SELECT id, "short", "describe" FROM "${TABLE}" ORDER BY id${LIMIT ? ` LIMIT ${LIMIT}` : ''}`);
    const rows = res.rows;
    console.log(`Načítaných riadkov: ${rows.length}\n`);

    const toUpdate = [];
    const stat = { short_convert: 0, short_skipHtml: 0, short_empty: 0, describe_convert: 0, describe_skipHtml: 0, describe_empty: 0 };
    for (const r of rows) {
      let changed = false;
      const next = { id: r.id, short: r.short, describe: r.describe };
      for (const col of COLUMNS) {
        const v = r[col];
        if (!v || !String(v).trim()) { stat[col + '_empty']++; continue; }
        if (looksLikeHtml(v)) { stat[col + '_skipHtml']++; continue; }
        next[col] = toHtml(v);
        stat[col + '_convert']++;
        changed = true;
      }
      if (changed) toUpdate.push({ orig: r, next });
    }

    console.log('Štatistika:', JSON.stringify(stat, null, 2));
    console.log(`\nRiadkov na update: ${toUpdate.length}\n`);

    toUpdate.slice(0, 2).forEach((u, i) => {
      console.log(`── Ukážka #${i + 1} (id=${u.orig.id})`);
      for (const col of COLUMNS) {
        if (u.next[col] !== u.orig[col]) {
          console.log(`   ${col} PRED: ${JSON.stringify(String(u.orig[col] || '').slice(0, 120))}`);
          console.log(`   ${col} PO:   ${JSON.stringify(String(u.next[col] || '').slice(0, 160))}`);
        }
      }
      console.log('');
    });

    if (!APPLY) { console.log('Dry-run hotový. Pre reálnu migráciu pridaj --apply (odporúčam najprv --limit=20).'); return; }
    if (!toUpdate.length) { console.log('Niet čo migrovať.'); return; }

    const backupsDir = path.resolve(__dirname, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupsDir, `products-${stamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(toUpdate.map(u => ({ id: u.orig.id, short: u.orig.short, describe: u.orig.describe })), null, 2), 'utf8');
    console.log(`💾 Záloha: ${backupFile}\n`);

    let ok = 0, failed = 0;
    for (const u of toUpdate) {
      try {
        await client.query(`UPDATE "${TABLE}" SET "short" = $1, "describe" = $2 WHERE id = $3`, [u.next.short, u.next.describe, u.orig.id]);
        ok++;
      } catch (e) { console.log(`  ❌ id=${u.orig.id}: ${e.message}`); failed++; }
    }
    console.log(`\nHotovo: ✅ ${ok}, ❌ ${failed}.`);
    console.log(`Návrat: node scripts/migrate-products-to-html.cjs --restore=${path.relative(process.cwd(), backupFile)}`);
    if (failed) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error('Migrácia zlyhala:', err); process.exit(1); });
