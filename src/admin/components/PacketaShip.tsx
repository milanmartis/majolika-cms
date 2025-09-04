import React, { useState } from 'react';
import { Button } from '@strapi/design-system/Button';
import { TextInput } from '@strapi/design-system/TextInput';
import { Flex } from '@strapi/design-system/Flex';
import { useCMEditViewDataManager, request, useNotification } from '@strapi/helper-plugin';

const PacketaShip: React.FC = () => {
  const { initialData, layout } = useCMEditViewDataManager() as any;
  const toggleNotif = useNotification();
  const [weight, setWeight] = useState<string>(initialData?.parcelWeightKg ? String(initialData.parcelWeightKg) : '');

  if (layout?.uid !== 'api::order.order' || !initialData?.id) return null;

  const isPacketa = initialData.deliveryMethod === 'packeta_box';
  const disabled = !isPacketa;

  const onClick = async () => {
    if (!weight || Number(weight) <= 0) {
      toggleNotif({ type: 'warning', message: { id: 'Weight required', defaultMessage: 'Zadaj váhu balíka (kg).' }});
      return;
    }
    try {
      const res = await request(`/orders/${initialData.id}/packeta/ship`, {
        method: 'POST',
        body: { weightKg: Number(weight) }
      });
      toggleNotif({ type: 'success', message: { id: 'Shipped', defaultMessage: 'Zásielka vytvorená v Packeta.' }});
      if (res?.labelUrl) window.open(res.labelUrl, '_blank');
    } catch (e) {
      toggleNotif({ type: 'danger', message: { id: 'Ship failed', defaultMessage: 'Odoslanie do Packeta zlyhalo.' }});
    }
  };

  return (
    <Flex direction="column" gap={2}>
      <TextInput
        label="Váha balíka (kg)"
        name="parcelWeightKg"
        value={weight}
        onChange={e => setWeight(e.target.value)}
        placeholder="napr. 1.25"
        required
      />
      <Button onClick={onClick} disabled={disabled}>
        Odoslať do Packeta
      </Button>
      {!isPacketa && <small>Aktuálna objednávka nemá spôsob doručenia Packeta.</small>}
    </Flex>
  );
};

export default PacketaShip;
