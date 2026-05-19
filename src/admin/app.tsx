///src/admin/app.tsx
import React from 'react';
import type { StrapiApp } from '@strapi/strapi/admin';
import PacketaShipModal from './packeta/PacketaShipModal';

const isOrderCT = (model: string) => model === 'api::order.order';

/**
 * === Idle logout guard (robustný) ===
 * - Sleduje reálnu nečinnosť (myš/klávesnica/scroll/touch/focus/visibility).
 * - Po IDLE_MS:
 *    a) zablokuje ďalšie volania /admin/renew-token (aby sa session NEobnovila),
 *    b) pokúsi sa o serverový logout (vymazanie HttpOnly cookie),
 *    c) hard redirect na /admin/auth/login.
 */
const IDLE_MS = 3 * 60 * 60 * 1000; // 3 h
// const IDLE_MS = 3 * 60 * 60 * 1000; // 3 h; na test daj napr. 30 * 1000
const ADMIN_BASE = '/admin';

function mountIdleLogout() {
  let timeoutId: number | undefined;
  let idleArmed = false;

  // --- A) patch fetch: po idle blokuj renew/init, aby sa session neobnovila ---
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input.toString();
      if (idleArmed) {
        // Zablokuj všetky pokusy o keep-alive/renew/init
        if (url.includes(`${ADMIN_BASE}/renew-token`) || url.includes(`${ADMIN_BASE}/init`)) {
          // vráť „odhlásený“ stav bez kontaktu so serverom
          return new Response(null, { status: 401, statusText: 'Idle lock' });
        }
      }
    } catch {
      // ignore
    }
    return origFetch(input as any, init);
  };

  const hardRedirectToLogin = () => {
    // Poistka: vyčisti local/session storage (Strapi si tu drží pár UI stavov)
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    // Hard redirect bez návratu v histórii
    window.location.replace(`${ADMIN_BASE}/auth/login?reason=idle`);
  };

  const serverLogout = async () => {
    // 1) zablokuj renew
    idleArmed = true;

    // 2) pokus o serverový logout (vymazanie HttpOnly cookies)
    try {
      // v5 používa POST /admin/logout; necháme credentials, aby sa poslala cookie
      await fetch(`${ADMIN_BASE}/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    } finally {
      // 3) a nakoniec hard redirect na login
      hardRedirectToLogin();
    }
  };

  const armTimer = () => {
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(serverLogout, IDLE_MS);
  };

  // Reštart timeru len pri reálnej interakcii používateľa
  const onActivity = () => {
    if (idleArmed) return; // už smerujeme na logout
    armTimer();
  };

  // Window events
  const windowEvents: (keyof WindowEventMap)[] = [
    'mousemove',
    'mousedown',
    'keydown',
    'scroll',
    'touchstart',
    'focus',
  ];
  windowEvents.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));

  // Document events (TS: tu patrí visibilitychange)
  const documentEvents: (keyof DocumentEventMap)[] = ['visibilitychange'];
  documentEvents.forEach((ev) => document.addEventListener(ev, onActivity, { passive: true } as AddEventListenerOptions));

  // štart
  armTimer();
}

export default {

  config: {
    tutorials: false,
    notifications: {
      releases: false,
    },
  },
  
  register(_app: StrapiApp) {},

  bootstrap(app: StrapiApp) {
    // 1) spusti idle guard
    mountIdleLogout();

    // 2) tvoj Packeta action v Content Manageri
    const cm = app.getPlugin('content-manager');
    const apis = cm?.apis;
    if (!apis || typeof apis.addDocumentAction !== 'function') {
      console.warn('[Packeta] Content Manager APIs are not available.');
      // idle guard zostáva aktívny
      return;
    }

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
            content: ({ onClose }: { onClose: () => void }) => {
              const attrs =
                (document as any).data?.attributes ??
                (document as any).data ??
                (document as any);
            
              // v Strapi v5 máš v attrs.id / document.id klasické numeric ID
              const orderId = attrs?.id ?? (document as any)?.id;
            
              return (
                <PacketaShipModal
                  orderId={orderId}
                  defaultWeightKg={1.0}
                  onSuccess={onClose}
                  onClose={onClose}
                />
              );
            },
          },
          variant: 'default' as const,
        };
      }) as any,
      ...actions,
    ]);
  },
};
