/**
 * Vytvorí JEDNU manuálnu darčekovú poukážku (obíde admin-UI kolíziu poľa `status`).
 * Vytvára cez Strapi document service, takže sa spustí afterCreate → ODOŠLE e-mail s kódom.
 *
 *   node scripts/create-manual-voucher.cjs            # DRY-RUN (len vypíše, čo by vytvoril)
 *   node scripts/create-manual-voucher.cjs --apply    # reálne vytvorí + pošle e-mail
 *
 * Spúšťať NA SERVERI (potrebuje prístup k DB + SMTP z .env).
 * E-mail príde na recipientEmail (fallback customerEmail).
 *
 * Údaje poukážky uprav v CONFIG nižšie.
 */
'use strict';

const { createStrapi, compileStrapi } = require('@strapi/strapi');

const APPLY = process.argv.includes('--apply');

// ─── ÚDAJE POUKÁŽKY ───────────────────────────────────────────────
const CONFIG = {
  // Kód: nechaj prázdne '' = vygeneruje sa unikátny MAJ-XXXX-XXXX.
  // Ak chceš vlastný, napíš ho sem (napr. 'MAJ-CFTZ-MKII').
  code: '',

  voucherType: 'value',          // 'value' = hodnotová (kredit), 'service' = na konkrétnu službu
  title: 'Zľava 90€',
  amount: 90,                    // hodnota poukážky (EUR)
  currency: 'EUR',

  customerName: 'Mária Hrbáčková',
  customerEmail: 'info@leagme.com',
  recipientName: '',             // ak daruje niekomu inému, meno príjemcu
  recipientEmail: 'info@leagme.com', // sem príde e-mail s kódom
  message: 'pokus',

  // Platnosť (Europe/Bratislava). validTo = koniec dňa, aby platila celý deň.
  validFrom: '2026-10-19T00:00:00+02:00',
  validTo:   '2026-12-31T23:59:59+01:00',

  // Naviazanie na zákaznícky záznam (relácia customer).
  // Hľadá sa podľa mena; ak chceš presne, vlož documentId sem:
  customerDocumentId: '',
};
// ──────────────────────────────────────────────────────────────────

async function resolveCustomerDocumentId(app) {
  if (CONFIG.customerDocumentId) return CONFIG.customerDocumentId;

  // skús najprv podľa e-mailu (unikátny), potom podľa mena
  const byEmail = CONFIG.customerEmail
    ? await app.documents('api::customer.customer').findMany({
        filters: { email: CONFIG.customerEmail }, fields: ['name', 'email'], limit: 5,
      })
    : [];

  const byName = await app.documents('api::customer.customer').findMany({
    filters: { name: CONFIG.customerName }, fields: ['name', 'email'], limit: 5,
  });

  const candidates = byEmail.length ? byEmail : byName;

  if (candidates.length === 1) {
    const c = candidates[0];
    console.log(`   👤 zákazník naviazaný: ${c.name} <${c.email}> (${c.documentId})`);
    return c.documentId;
  }

  if (candidates.length === 0) {
    console.log('   ⚠️  zákaznícky záznam sa nenašiel – poukážka sa vytvorí BEZ relácie (customerName/Email ostanú uložené).');
    return null;
  }

  console.log(`   ⚠️  našlo sa ${candidates.length} zákazníkov – relácia sa nenaviaže (nejednoznačné). Vlož customerDocumentId do CONFIG.`);
  candidates.forEach((c) => console.log(`        • ${c.name} <${c.email}>  ${c.documentId}`));
  return null;
}

async function main() {
  console.log(`\n${APPLY ? '✍️  VYTVORENIE POUKÁŽKY (+ e-mail)' : '🔎 DRY-RUN (nič sa nevytvorí)'}`);

  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'error';

  try {
    // kód
    let code = CONFIG.code && CONFIG.code.trim();
    if (code) {
      const existing = await app.documents('api::gift-voucher.gift-voucher').findMany({
        filters: { code }, fields: ['code'], limit: 1,
      });
      if (existing.length) throw new Error(`Kód ${code} už existuje – zvoľ iný alebo nechaj CONFIG.code prázdne.`);
    } else {
      code = await app.service('api::gift-voucher.gift-voucher').generateUniqueCode();
    }

    const customerDocumentId = await resolveCustomerDocumentId(app);

    const data = {
      code,
      voucherStatus: 'active',
      voucherType: CONFIG.voucherType,
      title: CONFIG.title,
      amount: CONFIG.amount,
      remainingValue: CONFIG.voucherType === 'value' ? CONFIG.amount : null,
      currency: CONFIG.currency,
      customerName: CONFIG.customerName || null,
      customerEmail: CONFIG.customerEmail || null,
      recipientName: CONFIG.recipientName || null,
      recipientEmail: CONFIG.recipientEmail || null,
      message: CONFIG.message || null,
      validFrom: CONFIG.validFrom ? new Date(CONFIG.validFrom).toISOString() : null,
      validTo: CONFIG.validTo ? new Date(CONFIG.validTo).toISOString() : null,
      generationSource: 'manual',
      ...(customerDocumentId ? { customer: customerDocumentId } : {}),
      meta: { createdManually: true, createdAt: new Date().toISOString() },
    };

    const emailTo = CONFIG.recipientEmail || CONFIG.customerEmail;

    console.log(`\n   kód:        ${code}`);
    console.log(`   typ:        ${data.voucherType}  |  hodnota: ${data.amount} ${data.currency}`);
    console.log(`   zákazník:   ${data.customerName} <${data.customerEmail}>`);
    console.log(`   e-mail na:  ${emailTo}`);
    console.log(`   platnosť:   ${data.validFrom} → ${data.validTo}`);

    if (!APPLY) {
      console.log('\nDry-run hotový. Pre reálne vytvorenie + odoslanie e-mailu pridaj --apply.\n');
      return;
    }

    const created = await app.documents('api::gift-voucher.gift-voucher').create({ data });
    console.log(`\n✅ Vytvorené: id=${created.id} documentId=${created.documentId} kód=${created.code}`);
    console.log(`📧 afterCreate odoslal e-mail na: ${emailTo} (PDF len ak má produkt šablónu – pri 90€ nie, len kód v tele e-mailu).`);
    console.log('');
  } finally {
    await app.destroy();
  }
}

main().catch((e) => { console.error('Chyba:', e); process.exit(1); });
