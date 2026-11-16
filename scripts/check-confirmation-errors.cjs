/**
 * Vypíše stav + chybu potvrdzujúcich e-mailov pre posledné objednávky (len číta).
 *   node scripts/check-confirmation-errors.cjs            # posledných 25
 *   node scripts/check-confirmation-errors.cjs --limit=50
 *   node scripts/check-confirmation-errors.cjs --failed   # len zlyhané
 */
'use strict';
require('dotenv').config();
const { Client } = require('pg');

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 25;
const ONLY_FAILED = process.argv.includes('--failed');

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
    const where = ONLY_FAILED ? `WHERE confirmation_email_status = 'failed'` : '';
    const q = await client.query(`
      SELECT id, customer_name, invoice_number, created_at,
             confirmation_email_status AS status,
             confirmation_email_sent_at AS sent_at,
             confirmation_email_error  AS error
      FROM orders
      ${where}
      ORDER BY id DESC
      LIMIT ${LIMIT}
    `);

    console.log(`\n=== Posledných ${q.rows.length} objednávok${ONLY_FAILED ? ' (len failed)' : ''} ===\n`);
    for (const r of q.rows) {
      const t = r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 16) : '?';
      const flag = r.status === 'failed' ? '🔴' : (r.status === 'sent' ? '🟢' : '⚪');
      console.log(`${flag} #${r.id}  ${t}  ${r.invoice_number || '-'}  ${r.customer_name || '-'}  [${r.status || 'null'}]`);
      if (r.error) console.log(`     chyba: ${String(r.error).slice(0, 300)}`);
    }

    // súhrn najčastejších chýb
    const errAgg = await client.query(`
      SELECT left(confirmation_email_error, 120) AS err, count(*) AS cnt
      FROM orders
      WHERE confirmation_email_status = 'failed' AND confirmation_email_error IS NOT NULL
      GROUP BY left(confirmation_email_error, 120)
      ORDER BY cnt DESC
      LIMIT 10
    `);
    if (errAgg.rows.length) {
      console.log(`\n=== Najčastejšie chyby (všetky failed) ===`);
      for (const r of errAgg.rows) console.log(`   ${r.cnt}×  ${r.err}`);
    }
    console.log('');
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error('Chyba:', e); process.exit(1); });
