'use strict';

import { processQueuedKrosOrders } from '../src/utils/kros';

export default {
  '*/1 * * * *': async () => {
    if (String(process.env.KROS_QUEUE_ENABLED || 'true').toLowerCase() !== 'true') {
      return;
    }

    try {
      const res = await processQueuedKrosOrders(10);
      strapi.log.info(`[KROS][CRON] scanned=${res.scanned} processed=${res.processed}`);
    } catch (e: any) {
      strapi.log.error('[KROS][CRON] failed:', e?.message || e);
    }
  },
};