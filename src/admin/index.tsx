import React from 'react';
import PacketaShip from './components/PacketaShip';

const extension = {
  register(app: any) {
    const cm = app.getPlugin('content-manager');
    const apis = cm?.apis;

    if (!apis || typeof apis.addEditViewSidePanel !== 'function') return;

    apis.addEditViewSidePanel([
      ({ model, documentId }: { model: string; documentId?: number | string | null }) => {
        if (model !== 'api::order.order' || !documentId) return null;

        return { title: 'Packeta', content: <PacketaShip /> };
      },
    ]);
  },
};

export default extension;
