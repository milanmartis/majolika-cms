// utils/invoice-number.ts
export async function nextInvoiceNumber(year?: number, trx?: any) {
    const y = year ?? new Date().getFullYear();
  
    const db = trx ?? strapi.db.connection; // knex
  
    const rows = await db.raw(
      `
      INSERT INTO invoice_counters (year, last_number, created_at, updated_at)
      VALUES (?, 1, NOW(), NOW())
      ON CONFLICT (year)
      DO UPDATE SET last_number = invoice_counters.last_number + 1, updated_at = NOW()
      RETURNING last_number
      `,
      [y]
    );
  
    const last = rows?.rows?.[0]?.last_number;
    const seq = Number(last);
    const inv = `${y}${String(seq).padStart(4, "0")}`; // 20260001
    return { year: y, seq, invoiceNumber: inv };
  }
  