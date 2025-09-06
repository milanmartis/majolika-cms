export default {
  async create(ctx) {
    try {
      const { body } = ctx.request;

      // DEBUG
      strapi.log.info('CHECKOUT PAYLOAD (controller):');
      strapi.log.info(JSON.stringify(body, null, 2));

      // prepošli do service
      const result = await strapi.service('api::checkout.checkout').createSession(body);
      // result má tvoj tvar: { checkoutUrl: string | null }

      const url = result?.checkoutUrl || null;

      // ak je karta a máme URL -> pošli konzistentne aj ako sessionUrl
      const response = {
        ok: true,
        sessionUrl: url,       // <-- nový jednotný kľúč
        checkoutUrl: url,      // <-- nechávame aj starý pre spätnú kompatibilitu
      };

      // Ak chceš hard redirect už zo servera (nie je nutné):
      if (url) {
        // POZOR: niektoré klienty preferujú JSON; 303 je voliteľný
        // odkomentuj, ak to chceš
        // ctx.status = 303;
        // ctx.set('Location', url);
      }

      return ctx.send(response);
    } catch (err: any) {
      strapi.log.error('[CHECKOUT][CREATE] error:', err?.message || err);
      return ctx.badRequest(err?.message || 'Checkout failed');
    }
  },
};
