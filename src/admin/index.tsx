// src/admin/index.tsx
import React from 'react';
import PacketaShip from './components/PacketaShip';

const extension = {
  register(app: any) {
    const cm = app.getPlugin('content-manager');
    const apis = cm?.apis;

    if (!apis || typeof apis.addEditViewSidePanel !== 'function') return;

    // Panel sa vykreslí len na Edit view objednávky s existujúcim ID
    const PacketaPanel = ({
      model,
      document,
      documentId,
    }: {
      model: string;
      document?: any;
      documentId?: string | number | null;
    }) => {
      if (model !== 'api::order.order' || !documentId) return null;
      return {
        title: 'Packeta',
        content: (
          <PacketaShip
            model={model}
            documentId={documentId}
            document={document}
          />
        ),
      };
    };

    apis.addEditViewSidePanel([PacketaPanel]);
  },
};

export default extension;
