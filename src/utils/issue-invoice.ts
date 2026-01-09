// utils/issue-invoice.ts
import { nextInvoiceNumber } from "./invoice-number";

export async function issueInvoiceForOrder(orderId: string | number) {
  const id = typeof orderId === "string" ? Number(orderId) : orderId;
  if (!Number.isFinite(Number(id))) throw new Error("Invalid orderId");

  const ORDERS_TABLE = "orders"; // ak máš inak, prepíš

  return await strapi.db.connection.transaction(async (trx: any) => {
    // 1) načítaj iba potrebné polia
    const order = await trx(ORDERS_TABLE)
      .select("id", "created_at", "invoice_number")
      .where({ id })
      .first();

    if (!order) throw new Error("Order not found");

    // 2) idempotencia
    if (order.invoice_number) {
      return { invoiceNumber: String(order.invoice_number), alreadyIssued: true };
    }

    // 3) atomický "claim": update prejde len ak invoice_number je stále null
    const claimCount = await trx(ORDERS_TABLE)
      .where({ id })
      .whereNull("invoice_number")
      .update({ invoice_issued_at: trx.fn.now() });

    // ak claim nevyšiel, niekto to stihol skôr -> znovu načítaj
    if (claimCount === 0) {
      const again = await trx(ORDERS_TABLE)
        .select("invoice_number")
        .where({ id })
        .first();

      if (again?.invoice_number) {
        return { invoiceNumber: String(again.invoice_number), alreadyIssued: true };
      }

      // edge: claimnuté ale číslo ešte nie je (request práve beží)
      throw new Error("Invoice issuing in progress, retry");
    }

    // 4) vygeneruj nové číslo v rovnakej transakcii (tvoj ON CONFLICT je atomický)
    const createdAt = order.created_at ? new Date(order.created_at) : new Date();
    const year = createdAt.getFullYear();

    const { invoiceNumber } = await nextInvoiceNumber(year, trx);

    // 5) zapíš číslo
    await trx(ORDERS_TABLE)
      .where({ id })
      .update({
        invoice_number: invoiceNumber,
        invoice_issued_at: trx.fn.now(),
      });

    return { invoiceNumber, alreadyIssued: false };
  });
}
