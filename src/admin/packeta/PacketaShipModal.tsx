import React, { useState } from 'react';
import { Box, Flex, Button, Typography, NumberInput } from '@strapi/design-system';
import { useNotification, useFetchClient, useCMEditViewDataManager } from '@strapi/helper-plugin';

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
};
const PacketaShipModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const { initialData } = useCMEditViewDataManager();
  const orderId = Number(initialData?.id);              // ← číselné ID z edit view
  const [weight, setWeight] = useState<number>(1.0);
  const [loading, setLoading] = useState(false);
  const { toggleNotification } = useNotification();
  const { post } = useFetchClient();

  const submit = async () => {
    if (!Number.isFinite(orderId)) {
      toggleNotification({ type: 'danger', message: 'Chýba ID objednávky.' });
      return;
    }
    const weightKg = Number(weight);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      toggleNotification({ type: 'warning', message: 'Neplatná hmotnosť.' });
      return;
    }

    try {
      setLoading(true);
      const res = await post(`/orders/${orderId}/packeta/ship`, { weightKg });
      const data = res?.data || res; // podľa verzie helper klienta
      toggleNotification({
        type: 'success',
        message: `Zásielka vytvorená. Tracking: ${data?.trackingNumber || '—'}`,
      });
      onSuccess?.();
      onClose();
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message || 'Chyba pri vytvorení zásielky.';
      toggleNotification({ type: 'danger', message: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box padding={4}>
      <Flex direction="column" gap={4}>
        <Typography variant="beta" fontWeight="bold">Odoslať do Packeta</Typography>
        <div>
          <label htmlFor="weightKg">Hmotnosť (kg)</label>
          <NumberInput
            id="weightKg"
            name="weightKg"
            aria-label="Hmotnosť v kilogramoch"
            step={0.01}
            value={weight}
            onValueChange={(v?: number) => setWeight(Number(v) || 0)}
            required
          />
          <Typography variant="pi">Zadaj hmotnosť (napr. 1.25)</Typography>
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
