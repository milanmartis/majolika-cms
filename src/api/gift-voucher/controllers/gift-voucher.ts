import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::gift-voucher.gift-voucher' as any,
  ({ strapi }) => ({
    async validate(ctx) {
      try {
        const { code, productSlug } = ctx.request.body || {};

        const result = await strapi
          .service('api::gift-voucher.gift-voucher')
          .validateVoucher(code, productSlug);

        ctx.body = result;
      } catch (err: any) {
        ctx.badRequest(err.message || 'Voucher sa nepodarilo overiť.');
      }
    },

    async redeem(ctx) {
      try {
        const { code, orderDocumentId, orderInvoiceNumber, amountToUse } = ctx.request.body || {};

        if (!code || !orderDocumentId) {
          return ctx.badRequest('Chýba code alebo orderDocumentId.');
        }

        const result = await strapi
          .service('api::gift-voucher.gift-voucher')
          .redeemVoucher({
            code,
            orderDocumentId,
            orderInvoiceNumber,
            amountToUse,
          });

        ctx.body = result;
      } catch (err: any) {
        ctx.badRequest(err.message || 'Voucher sa nepodarilo uplatniť.');
      }
    },

    async createForPaidOrder(ctx) {
      try {
        const { orderDocumentId } = ctx.request.body || {};

        if (!orderDocumentId) {
          return ctx.badRequest('Chýba orderDocumentId.');
        }

        const order = await strapi.documents('api::order.order').findOne({
          documentId: orderDocumentId,
          populate: {
            customer: true,
            items: true,
          },
        } as any);

        const fullOrder = order as any;

        if (!fullOrder) {
          return ctx.notFound('Objednávka neexistuje.');
        }

        if (fullOrder.paymentStatus !== 'paid') {
          return ctx.badRequest('Voucher sa môže vytvoriť až po zaplatení objednávky.');
        }

        const created: any[] = [];
        const items = Array.isArray(fullOrder.items) ? fullOrder.items : [];

        console.log('DEBUG ORDER ITEMS:', JSON.stringify(items, null, 2));

        for (const item of items) {
          const isGiftVoucher =
            item?.isGiftVoucher === true || item?.type === 'gift_voucher';

          if (!isGiftVoucher) continue;

          const qty = Number(item.quantity || 1);

          for (let i = 0; i < qty; i++) {
            const code = await strapi
              .service('api::gift-voucher.gift-voucher')
              .generateUniqueCode();

            const createdVoucher = await strapi.documents('api::gift-voucher.gift-voucher' as any).create({
              data: {
                code,
                status: 'active',
                voucherType: item?.voucherType === 'value' ? 'value' : 'service',
                title: item?.productName || 'Darčeková poukážka',
                productName: item?.productName || null,
                productSlug: item?.slug || null,
                allowedProductSlug: item?.slug || null,
                amount: item?.voucherValue || item?.unitPrice || null,
                remainingValue:
                  item?.voucherType === 'value'
                    ? (item?.voucherValue || item?.unitPrice || null)
                    : null,
                currency: 'EUR',
                customerName: fullOrder.customerName || null,
                customerEmail: fullOrder.customerEmail || null,
                recipientName: item?.recipientName || null,
                recipientEmail: item?.recipientEmail || null,
                message: item?.giftMessage || null,
                validFrom: new Date().toISOString(),
                validTo: item?.voucherValidTo || null,
                orderItemId: item?.id ? String(item.id) : null,
                sourceOrderInvoiceNumber: fullOrder.invoiceNumber || null,
                sourceOrder: fullOrder.documentId,
                customer: fullOrder.customer?.documentId || null,
                meta: {
                  sourceItem: item,
                },
              } as any,
            } as any);

            created.push(createdVoucher);
          }
        }

        ctx.body = {
          ok: true,
          count: created.length,
          vouchers: created,
        };
      } catch (err: any) {
        ctx.badRequest(err.message || 'Nepodarilo sa vytvoriť vouchery z objednávky.');
      }
    },
  })
);