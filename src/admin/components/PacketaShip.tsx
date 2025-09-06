import React, { useState } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { Box, Flex, Button, TextInput, Typography, Field } from '@strapi/design-system';

export type PacketaShipProps = {
  model: string;
  documentId?: string | number | null;
  document?: any;
};

const PacketaShip: React.FC<PacketaShipProps> = ({ model, documentId, document }) => {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();

  // zobraz iba na existujúcej objednávke
  if (model !== 'api::order.order' || !documentId) return null;

  const isPacketa = document?.deliveryMethod === 'packeta_box';
  const [weight, setWeight] = useState<string>(
    document?.parcelWeightKg ? String(document.parcelWeightKg) : ''
  );
  const [loading, setLoading] = useState(false);

  const ship = async (): Promise<void> => {
    if (!weight || Number(weight) <= 0) {
      toggleNotification({ type: 'warning', message: 'Zadaj váhu balíka (kg).' });
      return;
    }
    setLoading(true);
    try {
      // POZOR na route – viď bod 3 nižšie (politika pre admin JWT)
      const res = await post(`/orders/${documentId}/packeta/ship`, {
        weightKg: Number(weight),
      });

      toggleNotification({ type: 'success', message: 'Zásielka vytvorená v Packeta.' });

      const labelUrl = (res as any)?.data?.labelUrl;
      if (labelUrl) window.open(labelUrl, '_blank');
    } catch (e: any) {
      const msg =
        e?.response?.data?.error?.message ||
        e?.message ||
        'Odoslanie do Packeta zlyhalo.';
      toggleNotification({ type: 'danger', message: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box padding={4} hasRadius background="neutral0" shadow="filterShadow">
      <Flex direction="column" gap={3}>
        <Typography tag="h3" variant="delta">Packeta</Typography>

        {!isPacketa ? (
          <Typography textColor="neutral600" variant="pi">
            Táto objednávka nemá spôsob doručenia <strong>packeta_box</strong>.
          </Typography>
        ) : (
          <>
            <Field.Root name="parcelWeightKg" required>
              <Field.Label>Váha balíka (kg)</Field.Label>
              <TextInput
                placeholder="napr. 1.25"
                value={weight}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWeight(e.target.value)}
              />
              <Field.Error />
              <Field.Hint />
            </Field.Root>

            <Button onClick={ship} loading={loading} disabled={!isPacketa}>
              Odoslať do Packeta
            </Button>
          </>
        )}
      </Flex>
    </Box>
  );
};

export default PacketaShip;
