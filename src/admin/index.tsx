// src/admin/index.tsx
import React from 'react';
import PacketaShip from './components/PacketaShip';
import { Select, Option } from '@strapi/design-system/Select';
import { Button } from '@strapi/design-system/Button';
import { ModalLayout, ModalHeader, ModalBody, ModalFooter } from '@strapi/design-system/ModalLayout';
import { useFetchClient, useNotification } from '@strapi/helper-plugin';

type DeliveryStatus = 'label_created'|'in_transit'|'at_pickup'|'delivered'|'returned';

const StatusModal = ({
  ids,
  onClose,
  onDone,
}: {
  ids: (number | string)[];
  onClose: () => void;
  onDone: () => void;
}) => {
  const { put } = useFetchClient();
  const notify = useNotification();
  const [value, setValue] = React.useState<DeliveryStatus>('in_transit');
  const [loading, setLoading] = React.useState(false);

  const apply = async () => {
    setLoading(true);
    try {
      await Promise.all(
        ids.map((id) =>
          put(`/content-manager/collection-types/api::order.order/${id}`, {
            data: { deliveryStatus: value },
          })
        )
      );
      notify({ type: 'success', message: { defaultMessage: 'Delivery status updated' } });
      onDone();
    } catch (e) {
      notify({ type: 'danger', message: { defaultMessage: 'Failed to update status' } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalLayout onClose={onClose} labelledBy="bulk-status-modal">
      <ModalHeader>Set delivery status</ModalHeader>
      <ModalBody>
        <Select value={value} onChange={setValue} placeholder="Choose status">
          <Option value="label_created">label_created</Option>
          <Option value="in_transit">in_transit</Option>
          <Option value="at_pickup">at_pickup</Option>
          <Option value="delivered">delivered</Option>
          <Option value="returned">returned</Option>
        </Select>
      </ModalBody>
      <ModalFooter
        startActions={<Button variant="tertiary" onClick={onClose}>Cancel</Button>}
        endActions={<Button onClick={apply} loading={loading}>Apply</Button>}
      />
    </ModalLayout>
  );
};

const extension = {
  register(_app: any) {},

  bootstrap(app: any) {
    // ---- Tvoj existujúci Packeta sidebar panel v Edit view ----
    const cm = app.getPlugin('content-manager');
    const apis = cm?.apis as any;
    if (!apis) return;

    const PacketaPanel = (props: any) => {
      const { model, document, documentId } = props;
      if (model !== 'api::order.order' || !documentId) return null;
      return {
        title: 'Packeta',
        content: <PacketaShip model={model} documentId={documentId} document={document} />,
      };
    };
    apis.addEditViewSidePanel([PacketaPanel]);

    // ---- NOVÉ: Bulk action pre List view (funguje aj pre single-select) ----
    apis.addBulkAction({
      name: 'orders-set-delivery-status',
      label: { id: 'orders.bulk.setDeliveryStatus', defaultMessage: 'Set delivery status' },
      // Zobraz len pre Orders
      isDisplayed: ({ model }: { model: string }) => model === 'api::order.order',
      // Komponent akcie
      Component: ({ ids, model, refetchData }: { ids: (number|string)[], model: string, refetchData: () => void }) => {
        const [open, setOpen] = React.useState(false);
        if (model !== 'api::order.order') return null;

        return (
          <>
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Set delivery status
            </Button>
            {open && (
              <StatusModal
                ids={ids}
                onClose={() => setOpen(false)}
                onDone={() => { setOpen(false); refetchData(); }}
              />
            )}
          </>
        );
      },
    });

    // (voliteľné) Ak chceš tlačidlo aj v Edit view headeri:
    apis.addDocumentHeaderAction({
      name: 'orders-quick-delivered',
      label: { id: 'orders.header.markDelivered', defaultMessage: 'Mark delivered' },
      isDisplayed: ({ model }: { model: string }) => model === 'api::order.order',
      Component: ({ documentId, refetchDocument }: any) => {
        const { put } = useFetchClient();
        const notify = useNotification();
        const run = async () => {
          try {
            await put(`/content-manager/collection-types/api::order.order/${documentId}`, {
              data: { deliveryStatus: 'delivered' },
            });
            notify({ type: 'success', message: { defaultMessage: 'Marked as delivered' } });
            refetchDocument();
          } catch {
            notify({ type: 'danger', message: { defaultMessage: 'Update failed' } });
          }
        };
        return <Button onClick={run}>Mark delivered</Button>;
      },
    });
  },
};

export default extension;
