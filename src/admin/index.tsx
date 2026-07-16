// src/admin/index.tsx
import React from 'react';
import PacketaShip from './components/PacketaShip';

import {
  Button,
  Field,
  SingleSelect,
  SingleSelectOption,
  Typography,
} from '@strapi/design-system';
import { getFetchClient, useNotification } from '@strapi/strapi/admin';

// ---- lokálne mini typy (vyhýbame sa importom typov z content-manager balíka)
type DeliveryStatus =
  | 'label_created'
  | 'in_transit'
  | 'at_pickup'
  | 'delivered'
  | 'returned';

type CMDocument = { documentId: number | string };
type EditPanelFn = (args: {
  model: string;
  document?: any;
  documentId?: number | string;
}) => { title: string; content: React.ReactNode } | null;

type BulkActionFn = (args: {
  model: string;
  documents: CMDocument[];
}) => {
  label: string;
  disabled?: boolean;
  dialog?: {
    type: 'modal';
    title?: string;
    content: (args: { onClose: () => void }) => React.ReactNode;
  };
} | null;

type HeaderActionFn = (args: {
  model: string;
  documentId?: number | string;
}) => { label: string; onClick: () => Promise<boolean | void> } | null;

// ---- obsah modalu pre hromadnú zmenu statusu
const StatusModalContent = ({
  ids,
  onClose,
}: {
  ids: (number | string)[];
  onClose: () => void;
}) => {
  const { put } = getFetchClient();
  const { toggleNotification } = useNotification();
  const [status, setStatus] = React.useState<DeliveryStatus>('in_transit');
  const [loading, setLoading] = React.useState(false);

  const apply = async () => {
    setLoading(true);
    try {
      await Promise.all(
        ids.map((id) =>
          put(`/content-manager/collection-types/api::order.order/${id}`, {
            data: { deliveryStatus: status },
          })
        )
      );
      toggleNotification({ type: 'success', message: 'Delivery status updated' });
      onClose(); // CM zoznam si refreshne sám
    } catch {
      toggleNotification({ type: 'danger', message: 'Failed to update status' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Field.Root name="deliveryStatus" required>
        <Field.Label>Delivery status</Field.Label>
        <SingleSelect
          value={status}
          onChange={(val) => setStatus(val as DeliveryStatus)}
        >
          <SingleSelectOption value="label_created">label_created</SingleSelectOption>
          <SingleSelectOption value="in_transit">in_transit</SingleSelectOption>
          <SingleSelectOption value="at_pickup">at_pickup</SingleSelectOption>
          <SingleSelectOption value="delivered">delivered</SingleSelectOption>
          <SingleSelectOption value="returned">returned</SingleSelectOption>
        </SingleSelect>
        <Field.Hint />
        <Field.Error />
      </Field.Root>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={apply} loading={loading}>
          Apply
        </Button>
      </div>
    </div>
  );
};

// ---- obsah modalu pre hromadné znovu-odoslanie potvrdenia
const ResendConfirmationModal = ({
  ids,
  onClose,
}: {
  ids: (number | string)[];
  onClose: () => void;
}) => {
  const { post } = getFetchClient();
  const { toggleNotification } = useNotification();
  const [loading, setLoading] = React.useState(false);
  const [apology, setApology] = React.useState(false);

  const run = async () => {
    setLoading(true);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await post(`/orders/${id}/resend-confirmation`, { apology });
        ok++;
      } catch {
        fail++;
      }
    }
    toggleNotification({
      type: fail ? 'warning' : 'success',
      message: `Potvrdenie – odoslané: ${ok}, zlyhalo: ${fail}`,
    });
    setLoading(false);
    onClose();
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Typography>
        Znova odoslať potvrdenie objednávky pre <strong>{ids.length}</strong> objednávok?
      </Typography>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={apology}
          onChange={(e) => setApology(e.target.checked)}
        />
        <Typography variant="pi">Pridať vetu o dodatočnom zaslaní (technický výpadok)</Typography>
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="tertiary" onClick={onClose}>
          Zrušiť
        </Button>
        <Button onClick={run} loading={loading}>
          Odoslať
        </Button>
      </div>
    </div>
  );
};

const extension = {
  register(_app: any) {},

  bootstrap(app: any) {
    const apis = app.getPlugin('content-manager')?.apis as {
      addEditViewSidePanel: (arr: EditPanelFn[]) => void;
      addBulkAction: (arr: BulkActionFn[]) => void;
      addDocumentHeaderAction: (arr: HeaderActionFn[]) => void;
    };

    if (!apis) return;

    // 1) Tvoj Packeta panel v Edit view
    const PacketaPanel: EditPanelFn = ({ model, document, documentId }) => {
      if (model !== 'api::order.order' || !documentId) return null;
      return {
        title: 'Packeta',
        content: (
          <PacketaShip model={model} documentId={documentId} document={document} />
        ),
      };
    };
    apis.addEditViewSidePanel([PacketaPanel]);

    // 2) Bulk action v List view (zobrazí sa po označení riadkov)
    const SetDeliveryStatusAction: BulkActionFn = ({ model, documents }) => {
      if (model !== 'api::order.order') return null;
      const ids = (documents ?? [])
        .map((d) => d.documentId)
        .filter(Boolean) as (number | string)[];

      return {
        label: 'Set delivery status',
        disabled: ids.length === 0,
        dialog: {
          type: 'modal',
          title: 'Set delivery status',
          content: ({ onClose }) => (
            <StatusModalContent ids={ids} onClose={onClose} />
          ),
        },
      };
    };
    apis.addBulkAction([SetDeliveryStatusAction]);

    // 3) Header action v Edit view: rýchle „Mark delivered“
    const MarkDeliveredHeader: HeaderActionFn = ({ model, documentId }) => {
      const { toggleNotification } = useNotification();
      const { put } = getFetchClient();

      if (model !== 'api::order.order' || !documentId) return null;

      return {
        label: 'Mark delivered',
        onClick: async () => {
          try {
            await put(
              `/content-manager/collection-types/api::order.order/${documentId}`,
              { data: { deliveryStatus: 'delivered' } }
            );
            toggleNotification({
              type: 'success',
              message: 'Marked as delivered',
            });
            return true; // CM refreshne dokument
          } catch {
            toggleNotification({ type: 'danger', message: 'Update failed' });
          }
        },
      };
    };
    apis.addDocumentHeaderAction([MarkDeliveredHeader]);

    // 4) Header action v Edit view: „Znova odoslať potvrdenie“ zákazníkovi
    const ResendConfirmationHeader: HeaderActionFn = ({ model, documentId }) => {
      const { toggleNotification } = useNotification();
      const { post } = getFetchClient();

      if (model !== 'api::order.order' || !documentId) return null;

      return {
        label: 'Znova odoslať potvrdenie',
        onClick: async () => {
          try {
            const res: any = await post(`/orders/${documentId}/resend-confirmation`, {});
            toggleNotification({
              type: 'success',
              message: `Potvrdenie odoslané: ${res?.data?.to ?? ''}`,
            });
            return true; // CM refreshne dokument (zmení sa confirmationEmailStatus)
          } catch (e: any) {
            toggleNotification({
              type: 'danger',
              message:
                e?.response?.data?.error?.message || 'Odoslanie potvrdenia zlyhalo.',
            });
          }
        },
      };
    };
    apis.addDocumentHeaderAction([ResendConfirmationHeader]);

    // 5) Bulk action v List view: „Znova odoslať potvrdenie“ pre označené objednávky
    const ResendConfirmationAction: BulkActionFn = ({ model, documents }) => {
      if (model !== 'api::order.order') return null;
      const ids = (documents ?? [])
        .map((d) => d.documentId)
        .filter(Boolean) as (number | string)[];

      return {
        label: 'Znova odoslať potvrdenie',
        disabled: ids.length === 0,
        dialog: {
          type: 'modal',
          title: 'Znova odoslať potvrdenie',
          content: ({ onClose }) => (
            <ResendConfirmationModal ids={ids} onClose={onClose} />
          ),
        },
      };
    };
    apis.addBulkAction([ResendConfirmationAction]);
  },
};

export default extension;
