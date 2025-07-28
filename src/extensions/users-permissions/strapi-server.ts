// src/extensions/users-permissions/strapi-server.ts

import type { Context } from 'koa';

export default (plugin: any) => {
  // 1) Zobraz v logu, aké controllery plugin users-permissions má
  strapi.log.info(
    `📦 users-permissions controllers: ${Object.keys(plugin.controllers).join(', ')}`
  );

  // 2) Nájdeš si controller, ktorý obsahuje pôvodnú "callback" metódu
  const controllerKey = Object.keys(plugin.controllers).find((key) =>
    typeof plugin.controllers[key]?.callback === 'function'
  );

  if (!controllerKey) {
    strapi.log.error('❌ users-permissions: nenašiel som žiadny controller s callback()');
    return plugin;
  }

  const providerController = plugin.controllers[controllerKey];

  // 3) Ulož originálnu metódu a prepíš ju
  const originalCallback = providerController.callback.bind(providerController);

  providerController.callback = async (ctx: Context & { state: any }) => {
    const redirectUrl = ctx.query.redirect_url as string | undefined;

    if (redirectUrl) {
      ctx.state.redirectTo = redirectUrl;
      strapi.log.info(`🔀 custom redirect_url = ${redirectUrl}`);
    }

    // Spusti originálny OAuth callback
    await originalCallback(ctx);

    // Nakoniec prepíš redirect, ak redirectUrl existuje
    if (redirectUrl) {
      strapi.log.info(`➡️ redirectujem užívateľa na ${redirectUrl}`);
      ctx.redirect(redirectUrl);
    }
  };

  return plugin;
};
