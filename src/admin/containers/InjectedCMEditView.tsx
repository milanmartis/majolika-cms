// src/admin/containers/InjectedCMEditView.tsx
import React from 'react';
import PacketaShip from '../components/PacketaShip';
import { unstable_useContentManagerContext as useContentManagerContext } from '@strapi/strapi/admin';

const InjectedCMEditView: React.FC = () => {
  const cm = useContentManagerContext() as unknown as {
    form?: { values?: any };
    layout?: { edit?: { schema?: { uid?: string } } };
  };

  const model = cm.layout?.edit?.schema?.uid || '';
  const document = cm.form?.values;
  const documentId = document?.id ?? null;

  return <PacketaShip model={model} documentId={documentId} document={document} />;
};

export default InjectedCMEditView;
export { InjectedCMEditView };
