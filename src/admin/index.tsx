// src/admin/index.tsx
import React from 'react';
import PacketaShip from './components/PacketaShip';
// (voliteľné) typy – ak chceš presné typovanie
// import type { ContentManagerPlugin, PanelComponent } from '@strapi/content-manager/strapi-admin';

const extension = {
  register(_app: any) {},

  bootstrap(app: any) {
    // Získaj Content Manager APIs
    // const apis = app.getPlugin('content-manager').apis as ContentManagerPlugin['config']['apis'];
    const cm = app.getPlugin('content-manager');
    const apis = cm?.apis as any;

    if (!apis || typeof apis.addEditViewSidePanel !== 'function') return;

    // Panel do pravého sidebaru Edit view
    const PacketaPanel = (props: any) => {
      const { model, document, documentId } = props;

      // Debug: uvidíš v konzole adminu či panel beží a aký je model/ID
      // console.debug('[PacketaPanel]', { model, documentId });

      // zobraz len na objednávke a len pri existujúcom zázname (Edit, nie Create)
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
