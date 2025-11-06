///src/admin/app.tsx
import React from 'react';
import type { StrapiApp } from '@strapi/strapi/admin';
import PacketaShipModal from './packeta/PacketaShipModal';

const isOrderCT = (model: string) => model === 'api::order.order';

/**
 * Idle logout guard
 * - Logs out the admin user after a period of REAL user inactivity (no mouse/keyboard/touch/scroll).
 * - Uses Strapi's own logout endpoint and then redirects to the admin login page.
 */
// const IDLE_MS = 3 * 60 * 60 * 1000; // 3 hours; for testing set e.g. 30 * 1000
const IDLE_MS = 3 * 60 * 60 * 1000; // 3 hours; for testing set e.g. 30 * 1000

function mountIdleLogout() {
  let timeoutId: number | undefined;

  const adminBase = '/admin'; // keep simple & robust; works behind proxies too

  const logout = async () => {
    try {
      await fetch(`${adminBase}/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore network errors — we still force redirect to login
    } finally {
      window.location.href = `${adminBase}/auth/login`;
    }
  };

  const reset = () => {
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(logout, IDLE_MS);
  };

  // Window-driven user events
  const windowEvents: (keyof WindowEventMap)[] = [
    'mousemove',
    'mousedown',
    'keydown',
    'scroll',
    'touchstart',
    'focus',
  ];

  windowEvents.forEach((ev) => {
    window.addEventListener(ev, reset, { passive: true });
  });

  // Document-driven events (e.g., visibilitychange)
  const documentEvents: (keyof DocumentEventMap)[] = ['visibilitychange'];
  documentEvents.forEach((ev) => {
    document.addEventListener(ev, reset, { passive: true } as AddEventListenerOptions);
  });

  // Start the initial countdown
  reset();
}

export default {
  register(_app: StrapiApp) {},

  bootstrap(app: StrapiApp) {
    // ---- 1) Mount idle-logout guard (always, independent of other plugins) ----
    mountIdleLogout();

    // ---- 2) Packeta action in Content Manager ----
    const cm = app.getPlugin('content-manager');
    const apis = cm?.apis;

    if (!apis || typeof apis.addDocumentAction !== 'function') {
      console.warn('[Packeta] Content Manager APIs are not available.');
      // Do NOT return — we still want the idle guard active above.
    } else {
      apis.addDocumentAction((actions: any[]) => [
        ((props: any) => {
          const { model, document, documentId } = props;
          if (!isOrderCT(model) || !document || !documentId) {
            return { label: 'Ship with Packeta', disabled: true };
          }

          const attrs =
            (document as any).data?.attributes ??
            (document as any).data ??
            (document as any);

          const deliveryMethod = attrs?.deliveryMethod;
          const packetaBoxId = attrs?.deliveryDetails?.packetaBoxId ?? null;
          const alreadyShipped = Boolean(attrs?.packetaShipmentId);

          const enabled =
            deliveryMethod === 'packeta_box' && !!packetaBoxId && !alreadyShipped;

          return {
            label: 'Ship with Packeta',
            position: 'panel' as const,
            disabled: !enabled,
            dialog: {
              type: 'modal',
              title: 'Packeta shipment',
              content: ({ onClose }: { onClose: () => void }) => (
                <PacketaShipModal
                  orderId={Number(documentId)}
                  defaultWeightKg={1.0}
                  onSuccess={onClose}
                  onClose={onClose}
                />
              ),
            },
            variant: 'default' as const,
          };
        }) as any,
        ...actions,
      ]);
    }
  },
};
