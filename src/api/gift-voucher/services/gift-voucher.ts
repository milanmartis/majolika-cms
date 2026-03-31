import { factories } from '@strapi/strapi';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomPart(length = 4) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function generateVoucherCode() {
  return `MAJ-${randomPart(4)}-${randomPart(4)}`;
}

export default factories.createCoreService(
  'api::gift-voucher.gift-voucher' as any,
  ({ strapi }) => ({
    async generateUniqueCode() {
      let code = '';
      let exists = true;
      let attempts = 0;

      while (exists && attempts < 20) {
        code = generateVoucherCode();

        const found = await strapi.documents('api::gift-voucher.gift-voucher' as any).findMany({
          filters: { code },
          fields: ['documentId'],
          limit: 1,
        } as any);

        exists = !!found?.length;
        attempts++;
      }

      if (exists) {
        throw new Error('Nepodarilo sa vygenerovať unikátny kód voucheru.');
      }

      return code;
    },

    async validateVoucher(code: string, productSlug?: string) {
      if (!code) {
        return {
          valid: false,
          reason: 'missing_code',
          message: 'Chýba kód poukážky.',
        };
      }

      const normalizedCode = code.trim().toUpperCase();

      const vouchers = await strapi.documents('api::gift-voucher.gift-voucher' as any).findMany({
        filters: { code: normalizedCode },
        populate: {
          sourceOrder: true,
          usedByOrder: true,
          customer: true,
        },
        limit: 1,
      } as any);

      const voucher = vouchers?.[0] as any;

      if (!voucher) {
        return {
          valid: false,
          reason: 'not_found',
          message: 'Poukážka neexistuje.',
        };
      }

      if (voucher.status === 'used') {
        return {
          valid: false,
          reason: 'used',
          message: 'Poukážka už bola použitá.',
        };
      }

      if (voucher.status === 'cancelled') {
        return {
          valid: false,
          reason: 'cancelled',
          message: 'Poukážka je zrušená.',
        };
      }

      if (voucher.status === 'expired') {
        return {
          valid: false,
          reason: 'expired',
          message: 'Poukážka exspirovala.',
        };
      }

      if (voucher.validTo && new Date(voucher.validTo).getTime() < Date.now()) {
        return {
          valid: false,
          reason: 'expired',
          message: 'Poukážka už nie je platná.',
        };
      }

      if (productSlug && voucher.allowedProductSlug && voucher.allowedProductSlug !== productSlug) {
        return {
          valid: false,
          reason: 'product_not_allowed',
          message: 'Táto poukážka neplatí na vybraný produkt.',
        };
      }

      if (voucher.voucherType === 'value') {
        const remaining = Number(voucher.remainingValue || 0);
        if (remaining <= 0) {
          return {
            valid: false,
            reason: 'empty_value',
            message: 'Na poukážke už nie je žiadna zostávajúca hodnota.',
          };
        }
      }

      return {
        valid: true,
        reason: null,
        message: 'Poukážka je platná.',
        voucher,
      };
    },

    async redeemVoucher(params: {
      code: string;
      orderDocumentId: string;
      orderInvoiceNumber?: string | null;
      amountToUse?: number;
    }) {
      const { code, orderDocumentId, orderInvoiceNumber, amountToUse } = params;

      const validation = await this.validateVoucher(code);

      if (!validation.valid || !validation.voucher) {
        return validation;
      }

      const voucher = validation.voucher as any;

      if (voucher.voucherType === 'service') {
        await strapi.documents('api::gift-voucher.gift-voucher' as any).update({
          documentId: voucher.documentId,
          data: {
            status: 'used',
            usedAt: new Date().toISOString(),
            usedByOrder: orderDocumentId,
            usedByOrderInvoiceNumber: orderInvoiceNumber || null,
          } as any,
        } as any);

        return {
          valid: true,
          redeemed: true,
          message: 'Poukážka bola úspešne použitá.',
        };
      }

      if (voucher.voucherType === 'value') {
        const currentRemaining = Number(voucher.remainingValue || 0);
        const useValue = Number(amountToUse || 0);

        if (useValue <= 0) {
          return {
            valid: false,
            redeemed: false,
            reason: 'invalid_amount',
            message: 'Neplatná suma na odpočítanie.',
          };
        }

        if (useValue > currentRemaining) {
          return {
            valid: false,
            redeemed: false,
            reason: 'insufficient_value',
            message: 'Na poukážke nie je dostatočný kredit.',
          };
        }

        const nextRemaining = Number((currentRemaining - useValue).toFixed(2));
        const nextStatus = nextRemaining <= 0 ? 'used' : 'active';

        await strapi.documents('api::gift-voucher.gift-voucher' as any).update({
          documentId: voucher.documentId,
          data: {
            remainingValue: nextRemaining,
            status: nextStatus,
            usedAt: nextRemaining <= 0 ? new Date().toISOString() : voucher.usedAt ?? null,
            usedByOrder: nextRemaining <= 0 ? orderDocumentId : voucher.usedByOrder?.documentId ?? null,
            usedByOrderInvoiceNumber:
              nextRemaining <= 0
                ? (orderInvoiceNumber || null)
                : (voucher.usedByOrderInvoiceNumber ?? null),
          } as any,
        } as any);

        return {
          valid: true,
          redeemed: true,
          message: 'Hodnotová poukážka bola úspešne použitá.',
          remainingValue: nextRemaining,
        };
      }

      return {
        valid: false,
        redeemed: false,
        reason: 'unsupported_type',
        message: 'Nepodporovaný typ poukážky.',
      };
    },
  })
);