// src/utils/issue-invoice.ts
import { nextInvoiceNumber } from './invoice-number';

export async function issueInvoiceForOrder(orderId: string | number) {
  const id = typeof orderId === 'string' ? Number(orderId) : orderId;

  if (!Number.isFinite(Number(id))) {
    throw new Error('Invalid orderId');
  }

  const ORDERS_TABLE = 'orders';

  return await strapi.db.connection.transaction(async (trx: any) => {
    const order = await trx(ORDERS_TABLE)
      .select(
        'id',
        'created_at',
        'invoice_number'
      )
      .where({ id })
      .first();

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.invoice_number) {
      return {
        invoiceNumber: String(order.invoice_number),
        alreadyIssued: true
      };
    }

    const claimCount = await trx(ORDERS_TABLE)
      .where({ id })
      .whereNull('invoice_number')
      .update({
        invoice_issued_at: trx.fn.now()
      });

    if (claimCount === 0) {
      const again = await trx(ORDERS_TABLE)
        .select('invoice_number')
        .where({ id })
        .first();

      if (again?.invoice_number) {
        return {
          invoiceNumber: String(again.invoice_number),
          alreadyIssued: true
        };
      }

      throw new Error('Invoice issuing in progress, retry');
    }

    const createdAt = order.created_at
      ? new Date(order.created_at)
      : new Date();

    const year = createdAt.getFullYear();

    const { invoiceNumber } = await nextInvoiceNumber(year, trx);

    await trx(ORDERS_TABLE)
      .where({ id })
      .update({
        invoice_number: invoiceNumber,
        invoice_issued_at: trx.fn.now()
      });

    return {
      invoiceNumber,
      alreadyIssued: false
    };
  });
}