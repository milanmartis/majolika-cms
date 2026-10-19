/**
 * Premenuje DB stĺpec gift_vouchers.status → voucher_status (kvôli kolízii s rezervovaným
 * poľom `status` v Strapi v5 content-manageri). Dáta sa zachovajú (RENAME, nie drop/add).
 *
 *   node scripts/rename-voucher-status-column.cjs            # DRY-RUN (len zistí stav)
 *   node scripts/rename-voucher-status-column.cjs --apply    # vykoná ALTER TABLE
 *
 * Idempotentné: ak už je premenované, nič nespraví.
 * DÔLEŽITÉ PORADIE: spusti TENTO skript TESNE PRED reštartom appky s novým kódom
 * (nový kód očakáva stĺpec voucher_status; starý bežiaci kód očakáva status).
 */
'use strict';
require('dotenv').config();
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');

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

async function columnExists(client, column) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'gift_vouchers' AND column_name = $1 LIMIT 1`,
    [column]
  );
  return r.rowCount > 0;
}

async function main() {
  const client = makeClient();
  await client.connect();
  try {
    const hasOld = await columnExists(client, 'status');
    const hasNew = await columnExists(client, 'voucher_status');

    console.log(`\nStav tabuľky gift_vouchers:`);
    console.log(`   stĺpec 'status'          : ${hasOld ? 'existuje' : 'NEexistuje'}`);
    console.log(`   stĺpec 'voucher_status'  : ${hasNew ? 'existuje' : 'NEexistuje'}`);

    if (hasNew && !hasOld) {
      console.log(`\n✅ Už je premenované (voucher_status existuje). Nič netreba.\n`);
      return;
    }
    if (hasNew && hasOld) {
      console.log(`\n⚠️  Existujú OBA stĺpce – nerobím nič automaticky, rieš ručne (skontroluj dáta).\n`);
      return;
    }
    if (!hasOld) {
      console.log(`\n⚠️  Stĺpec 'status' neexistuje a ani 'voucher_status' – nečakaný stav, rieš ručne.\n`);
      return;
    }

    // hasOld && !hasNew → premenovať
    if (!APPLY) {
      console.log(`\n🔎 DRY-RUN: spravil by som:  ALTER TABLE gift_vouchers RENAME COLUMN status TO voucher_status;`);
      console.log(`Pre reálne vykonanie pridaj --apply.\n`);
      return;
    }

    await client.query(`ALTER TABLE gift_vouchers RENAME COLUMN status TO voucher_status`);
    console.log(`\n✅ Hotovo: status → voucher_status. Dáta zachované.`);
    console.log(`➡️  Teraz hneď reštartuj appku s novým buildom.\n`);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error('Chyba:', e); process.exit(1); });
