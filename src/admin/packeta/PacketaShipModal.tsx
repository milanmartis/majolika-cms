import React, { useState } from 'react';
import { Box, Flex, Button, Typography, NumberInput } from '@strapi/design-system';
import { useNotification, getFetchClient } from '@strapi/strapi/admin';

type Props = {
  orderId: number;
  defaultWeightKg?: number;
  onSuccess?: () => void;
  onClose: () => void;
};

const PacketaShipModal: React.FC<Props> = ({ orderId, defaultWeightKg = 1.0, onSuccess, onClose }) => {
  const [weight, setWeight] = useState<number | undefined>(defaultWeightKg);
  const [loading, setLoading] = useState(false);
  const { toggleNotification } = useNotification();

  const submit = async () => {
    const weightKg = typeof weight === 'number' ? weight : 0;
    if (!weightKg || weightKg <= 0) {
      toggleNotification({ type: 'warning', message: 'Neplatná hmotnosť.' });
      return;
    }
  
    const { post } = getFetchClient();
  
    try {
      setLoading(true);
  
      const res = await post('/api/orders/' + orderId + '/packeta/ship', {
        weightKg,
      });
  
      // getFetchClient už parsuje JSON => data je rovno objekt
      const data = res?.data || res;
  
      toggleNotification({
        type: 'success',
        message: `Zásielka vytvorená. Tracking: ${data?.trackingNumber || '—'}`,
      });
  
      onSuccess?.();
      onClose();
    } catch (e: any) {
      console.error(e);
      toggleNotification({
        type: 'danger',
        message: e?.message || 'Chyba pri vytvorení zásielky.',
      });
    } finally {
      setLoading(false);
    }
  };
  

  return (
    <Box padding={4}>
      <Flex direction="column" gap={4}>
        <Typography variant="beta" fontWeight="bold">
          Odoslať do Packeta
        </Typography>

        <div>
          <label htmlFor="weightKg">Hmotnosť (kg)</label>
          <NumberInput
            id="weightKg"
            name="weightKg"
            aria-label="Hmotnosť v kilogramoch"
            step={0.01}
            value={weight}
            onValueChange={(value?: number) => setWeight(value)}
            required
          />
          <Typography variant="pi">
            Zadaj hmotnosť v kilogramoch (napr. 1.25)
          </Typography>
        </div>

        <Flex justifyContent="flex-end" gap={2}>
          <Button variant="tertiary" onClick={onClose}>Zrušiť</Button>
          <Button onClick={submit} loading={loading}>Odoslať</Button>
        </Flex>
      </Flex>
    </Box>
  );
};

export default PacketaShipModal;
