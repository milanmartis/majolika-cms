/**
 * Overí SMTP prihlásenie (po whiteliste IP na webhouse) a voliteľne pošle testovací e-mail.
 * Používa rovnaké .env hodnoty ako Strapi (SMTP_HOST/PORT/USER/PASS, EMAIL_DEFAULT_FROM).
 *
 *   node scripts/smtp-test.cjs                      # len overí prihlásenie (verify), nič nepošle
 *   node scripts/smtp-test.cjs --to=tvoj@email.sk   # overí + pošle testovací e-mail
 *
 * verify() spraví reálny SMTP handshake + AUTH login → ak prejde, geo-blok je preč.
 */
'use strict';
require('dotenv').config();
const nodemailer = require('nodemailer');

const toArg = process.argv.find((a) => a.startsWith('--to='));
const TO = toArg ? toArg.split('=').slice(1).join('=') : null;

function makeTransport() {
  const host = process.env.SMTP_HOST || 'mail.webhouse.sk';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!user || !pass) throw new Error('Chýbajú SMTP údaje: nastav SMTP_USER a SMTP_PASS v .env');
  return {
    transporter: nodemailer.createTransport({ host, port, secure: false, auth: { user, pass } }),
    host, port, user,
  };
}

async function main() {
  const { transporter, host, port, user } = makeTransport();
  const from = process.env.EMAIL_DEFAULT_FROM || user;

  console.log(`\nSMTP test`);
  console.log(`   host: ${host}:${port}`);
  console.log(`   user: ${user}`);
  console.log(`   from: ${from}\n`);

  // 1) Overenie prihlásenia (toto zlyhávalo kvôli geo-bloku)
  process.stdout.write('1) verify() – prihlásenie k SMTP... ');
  try {
    await transporter.verify();
    console.log('✅ OK (login prešiel, geo-blok je preč)');
  } catch (e) {
    console.log('❌ ZLYHALO');
    console.error(`   ${e && e.message ? e.message : e}`);
    console.log('\n   → Ak je tu stále "525 ... country is not allowed", IP ešte nie je povolená (alebo sa zmenila).');
    console.log('   → Skontroluj aktuálnu IP: curl -s https://ipinfo.io/ip\n');
    process.exit(1);
  }

  // 2) Voliteľný testovací e-mail
  if (!TO) {
    console.log('\nPrihlásenie funguje. Pre odoslanie testovacieho e-mailu pridaj --to=adresa.\n');
    return;
  }

  process.stdout.write(`2) odosielam testovací e-mail na ${TO}... `);
  try {
    const info = await transporter.sendMail({
      from,
      to: TO,
      subject: 'SMTP test – Majolika',
      text: `Testovací e-mail z ${host}. Ak ti prišiel, odosielanie funguje. Čas: ${new Date().toISOString()}`,
    });
    console.log('✅ ODOSLANÉ');
    console.log(`   messageId: ${info.messageId}`);
    if (info.accepted?.length) console.log(`   accepted: ${info.accepted.join(', ')}`);
    if (info.rejected?.length) console.log(`   rejected: ${info.rejected.join(', ')}`);
    console.log('');
  } catch (e) {
    console.log('❌ ZLYHALO');
    console.error(`   ${e && e.message ? e.message : e}\n`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('Chyba:', e); process.exit(1); });
