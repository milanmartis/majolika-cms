import React, { useState } from 'react';
import {
  unstable_useContentManagerContext as useContentManagerContext,
  useFetchClient,
  useNotification,
} from '@strapi/strapi/admin';
import { Box, Flex, Button, TextInput, Typography, Field } from '@strapi/design-system';

const PacketaShip: React.FC = () => {
  // Vynútime si typy, aby TS nehlásil chybu "Property 'values' does not exist on type '{}'"
  const cm = useContentManagerContext() as unknown as {
    form?: { values?: any };
    layout?: { edit?: { schema?: { uid?: string } } };
  };

  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();

  const values = cm.form?.values || {};
  const id = values?.id as number | string | undefined;

  // v Strapi v5 je UID na adrese layout.edit.schema.uid
  const contentTypeUid = cm.layout?.edit?.schema?.uid;

  // renderuj iba na objednávke
  if (!contentTypeUid || contentTypeUid !== 'api::order.order' || !id) return null;

  const isPacketa = values?.deliveryMethod === 'packeta_box';
  const [weight, setWeight] = useState<string>(
    values?.parcelWeightKg ? String(values.parcelWeightKg) : ''
  );
  const [loading, setLoading] = useState(false);

  const ship = async (): Promise<void> => {
    if (!weight || Number(weight) <= 0) {
      toggleNotification({ type: 'warning', message: 'Zadaj váhu balíka (kg).' });
      return;
    }
    setLoading(true);
    try {
      const res = await post(`/orders/${id}/packeta/ship`, {
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
