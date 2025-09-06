// src/admin/index.tsx
import React from 'react';
import PacketaShip from './components/PacketaShip';

const extension = {
  // nič nepotrebujeme v register
  register(_app: any) {},

  // Content-Manager APIs patria do bootstrap
  bootstrap(app: any) {
    const cm = app.getPlugin('content-manager');
    const apis = cm?.apis as any;

    if (!apis || typeof apis.addEditViewSidePanel !== 'function') return;

    // Panel vo vedľajšom pravom sidebare EditView
    const PacketaPanel = ({ model, document, documentId }: any) => {
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
