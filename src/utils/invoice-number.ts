export async function nextInvoiceNumber(year?: number) {
    const y = year ?? new Date().getFullYear();
  
    // Postgres: INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING
    const rows = await strapi.db.connection.raw(
      `
      INSERT INTO invoice_counters (year, last_number, created_at, updated_at)
      VALUES (?, 1, NOW(), NOW())
      ON CONFLICT (year)
      DO UPDATE SET last_number = invoice_counters.last_number + 1, updated_at = NOW()
      RETURNING last_number
      `,
      [y]
    );
  
    // knex raw pre PG vracia { rows: [...] }
    const last = rows?.rows?.[0]?.last_number;
    const seq = Number(last);
    const inv = `${y}${String(seq).padStart(4, "0")}`; // 20260001
    return { year: y, seq, invoiceNumber: inv };
  }
  