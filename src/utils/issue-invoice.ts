import { nextInvoiceNumber } from "./invoice-number";

export async function issueInvoiceForOrder(orderId: number) {
  const order = (await strapi.entityService.findOne("api::order.order", orderId, {
    // nepoužijeme fields, lebo TS typy ešte nemusia poznať nové polia
  })) as any;

  if (!order) throw new Error("Order not found");

  // idempotencia
  if (order.invoiceNumber) {
    return { invoiceNumber: order.invoiceNumber as string, alreadyIssued: true };
  }

  const year = new Date(order.createdAt || Date.now()).getFullYear();
  const { invoiceNumber } = await nextInvoiceNumber(year);

  await strapi.entityService.update("api::order.order", orderId, {
    data: {
      invoiceNumber,
      invoiceIssuedAt: new Date().toISOString(),
    } as any, // 👈 typy môžu byť mimo, ale Strapi to uloží
  });

  return { invoiceNumber, alreadyIssued: false };
}
