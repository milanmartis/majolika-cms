import React, { useState } from 'react';
import { useCMEditViewDataManager, request, useNotification } from '@strapi/helper-plugin';
import { Box } from '@strapi/design-system/Box';
import { Flex } from '@strapi/design-system/Flex';
import { Button } from '@strapi/design-system/Button';
import { TextInput } from '@strapi/design-system/TextInput';
import { Typography } from '@strapi/design-system/Typography';

const PacketaShip: React.FC = () => {
  // dáta otvorenej entity v edit view
  const { initialData, layout } = useCMEditViewDataManager() as any;
  const notify = useNotification();

  // renderuj iba na objednávke
  if (!layout || layout.uid !== 'api::order.order' || !initialData?.id) return null;

  const isPacketa = initialData.deliveryMethod === 'packeta_box';
  const [weight, setWeight] = useState<string>(
    initialData?.parcelWeightKg ? String(initialData.parcelWeightKg) : ''
  );
  const [loading, setLoading] = useState(false);

  const ship = async () => {
    if (!weight || Number(weight) <= 0) {
      notify({ type: 'warning', message: 'Zadaj váhu balíka (kg).' });
      return;
    }
    setLoading(true);
    try {
      const res = await request(`/orders/${initialData.id}/packeta/ship`, {
        method: 'POST',
        body: { weightKg: Number(weight) },
      });
      notify({ type: 'success', message: 'Zásielka vytvorená v Packeta.' });
      if (res?.labelUrl) window.open(res.labelUrl, '_blank');
    } catch (e: any) {
      notify({ type: 'danger', message: e?.message || 'Odoslanie do Packeta zlyhalo.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box padding={4} hasRadius background="neutral0" shadow="filterShadow">
      <Flex direction="column" gap={3}>
        <Typography as="h3" variant="delta">Packeta</Typography>

        {!isPacketa ? (
          <Typography textColor="neutral600" variant="pi">
            Táto objednávka nemá spôsob doručenia <strong>packeta_box</strong>.
          </Typography>
        ) : (
          <>
            <TextInput
              name="parcelWeightKg"
              label="Váha balíka (kg)"
              placeholder="napr. 1.25"
              value={weight}
              onChange={(e: any) => setWeight(e.target.value)}
              required
            />
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
