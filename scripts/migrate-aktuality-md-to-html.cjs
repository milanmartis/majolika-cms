/**
 * Jednorazová migrácia poľa `content` v Aktualitách z Markdownu na HTML.
 * (Prechod na CKEditor, ktorý ukladá HTML.)
 *
 * Pripája sa PRIAMO na Postgres (cez `pg` + DATABASE_URL z .env) – nepotrebuje
 * TypeScript build ani boot Strapi, takže beží aj na produkčnom serveri.
 *
 * Použitie (z rootu projektu):
 *
 *   # DRY-RUN – nič nezapíše, len počty + ukážka pred/po:
 *   node scripts/migrate-aktuality-md-to-html.cjs
 *
 *   # REÁLNA migrácia – spraví zálohu do scripts/backups/, potom prepíše:
 *   node scripts/migrate-aktuality-md-to-html.cjs --apply
 *
 *   # NÁVRAT späť zo zálohy (ak by niečo nesadlo):
 *   node scripts/migrate-aktuality-md-to-html.cjs --restore=scripts/backups/aktuality-content-XXXX.json
 *
 * Bezpečnosť:
 *   - Idempotentné: záznam, ktorý už vyzerá ako HTML, preskočí.
 *   - Pred zápisom vždy uloží zálohu {id, content} do JSON.
 *   - Ak sa tabuľka nevolá "aktuality", nastav ju cez env MIGRATE_TABLE.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { Client } = require('pg');

marked.setOptions({ gfm: true, breaks: true, mangle: false, headerIds: false });

const TABLE = process.env.MIGRATE_TABLE || 'aktuality';
const COLUMN = 'content';

const APPLY = process.argv.includes('--apply');
const restoreArg = process.argv.find((a) => a.startsWith('--restore='));
const RESTORE_FILE = restoreArg ? restoreArg.split('=').slice(1).join('=') : null;

function looksLikeHtml(s) {
  const v = String(s || '');
  return /<\/(p|h[1-6]|ul|ol|li|strong|em|a|blockquote|div|span|br)\b/i.test(v)
    || /<(p|h[1-6]|ul|ol|br)\b[^>]*>/i.test(v);
}
function mdToHtml(md) {
  return String(marked.parse(String(md || ''))).trim();
}

function makeClient() {
  const useSsl = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true';
  const ssl = useSsl
    ? { rejectUnauthorized: String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' }
    : false;

  if (process.env.DATABASE_URL) {
    return new Client({ connectionString: process.env.DATABASE_URL, ssl });
  }
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
      await client.query(`UPDATE "${TABLE}" SET "${COLUMN}" = $1 WHERE id = $2`, [r.content, r.id]);
      ok++;
    } catch (e) {
      console.log(`  ❌ id=${r.id}: ${e.message}`);
      failed++;
    }
  }
  console.log(`\nRestore hotový: ✅ ${ok}, ❌ ${failed}.`);
}

async function main() {
  const client = makeClient();
  await client.connect();

  try {
    if (RESTORE_FILE) {
      await restore(client);
      return;
    }

    console.log(`\n${APPLY ? '✍️  REÁLNA MIGRÁCIA' : '🔎 DRY-RUN (nič sa nezapíše)'}  – tabuľka "${TABLE}", stĺpec "${COLUMN}"  (MD → HTML)\n`);

    let res;
    try {
      res = await client.query(`SELECT id, "${COLUMN}" AS content FROM "${TABLE}" ORDER BY id`);
    } catch (e) {
      if (/relation .* does not exist/i.test(e.message)) {
        console.error(`❌ Tabuľka "${TABLE}" neexistuje. Nastav správny názov cez env MIGRATE_TABLE, napr.:\n   MIGRATE_TABLE=aktualities node scripts/migrate-aktuality-md-to-html.cjs`);
        process.exit(1);
      }
      throw e;
    }

    const rows = res.rows;
    console.log(`Načítaných riadkov (všetky jazyky + draft/published): ${rows.length}\n`);

    const toConvert = [];
    let skippedHtml = 0, skippedEmpty = 0;
    for (const r of rows) {
      if (!r.content || !String(r.content).trim()) { skippedEmpty++; continue; }
      if (looksLikeHtml(r.content)) { skippedHtml++; continue; }
      toConvert.push(r);
    }

    console.log(`Na konverziu: ${toConvert.length}`);
    console.log(`Preskočené (už HTML): ${skippedHtml}`);
    console.log(`Preskočené (prázdne): ${skippedEmpty}\n`);

    toConvert.slice(0, 2).forEach((r, i) => {
      console.log(`── Ukážka #${i + 1}  (id=${r.id})`);
      console.log(`   PRED (MD):  ${JSON.stringify(String(r.content).slice(0, 160))}`);
      console.log(`   PO  (HTML): ${JSON.stringify(mdToHtml(r.content).slice(0, 200))}\n`);
    });

    if (!APPLY) {
      console.log('Dry-run hotový. Pre reálnu migráciu spusti s --apply.');
      return;
    }
    if (!toConvert.length) {
      console.log('Niet čo migrovať.');
      return;
    }

    // Záloha
    const backupsDir = path.resolve(__dirname, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupsDir, `aktuality-content-${stamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(toConvert.map((r) => ({ id: r.id, content: r.content })), null, 2), 'utf8');
    console.log(`💾 Záloha uložená: ${backupFile}\n`);

    let ok = 0, failed = 0;
    for (const r of toConvert) {
      try {
        await client.query(`UPDATE "${TABLE}" SET "${COLUMN}" = $1 WHERE id = $2`, [mdToHtml(r.content), r.id]);
        ok++;
      } catch (e) {
        console.log(`  ❌ id=${r.id}: ${e.message}`);
        failed++;
      }
    }

    console.log(`\nHotovo: ✅ ${ok} zmigrovaných, ❌ ${failed} chýb.`);
    console.log(`Návrat späť: node scripts/migrate-aktuality-md-to-html.cjs --restore=${path.relative(process.cwd(), backupFile)}`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migrácia zlyhala:', err);
  process.exit(1);
});
