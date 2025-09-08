import React from 'react';
import type { StrapiApp } from '@strapi/strapi/admin';
import PacketaShipModal from './packeta/PacketaShipModal';

const isOrderCT = (model: string) => model === 'api::order.order';

export default {
  register(_app: StrapiApp) {},

  bootstrap(app: StrapiApp) {
    const cm = app.getPlugin('content-manager');
    const apis = cm?.apis;
    if (!apis || typeof apis.addDocumentAction !== 'function') {
      console.warn('[Packeta] Content Manager APIs are not available.');
      return;
    }

    apis.addDocumentAction((actions: any[]) => [
      ((props: any) => {
        const { model, document, documentId } = props;
        if (!isOrderCT(model) || !document || !documentId) {
          return { label: 'Ship with Packeta', disabled: true };
        }

        const attrs =
          (document as any).data?.attributes ??
          (document as any).data ??
          (document as any);

        const deliveryMethod = attrs?.deliveryMethod;
        const packetaBoxId = attrs?.deliveryDetails?.packetaBoxId ?? null;
        const alreadyShipped = Boolean(attrs?.packetaShipmentId);

        const enabled =
          deliveryMethod === 'packeta_box' && !!packetaBoxId && !alreadyShipped;

        return {
          label: 'Ship with Packeta',
          position: 'panel' as const,
          disabled: !enabled,
          dialog: {
            type: 'modal',
            title: 'Packeta shipment',
            content: ({ onClose }: { onClose: () => void }) => (
              <PacketaShipModal
                orderId={Number(documentId)}
                defaultWeightKg={1.0}
                onSuccess={onClose}
                onClose={onClose}
              />
            ),
          },
          variant: 'default' as const,
        };
      }) as any,
      ...actions,
    ]);
  },
};
