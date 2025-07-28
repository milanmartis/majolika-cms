// src/extensions/users-permissions/strapi-server.ts
import type { Context } from 'koa';

export default (plugin: any) => {
  // 1) Zobrazíme, čo plugin controllers obsahuje
  strapi.log.info(`📦 users-permissions controllers: ${Object.keys(plugin.controllers).join(', ')}`);

  // 2) V Strapi v5 je to v plugin.controllers.auth
  const authController = plugin.controllers.auth;
  if (typeof authController.callback !== 'function') {
    strapi.log.error('❌ users-permissions: auth.callback neexistuje');
    return plugin;
  }

  // 3) Uložíme originálnu metódu
  const originalCallback = authController.callback.bind(authController);

  // 4) Prepíšeme ju
  authController.callback = async (ctx: Context & { state: any }) => {
    const redirectUrl = ctx.query.redirect_url as string | undefined;
    if (redirectUrl) {
      ctx.state.redirectTo = redirectUrl;
      strapi.log.info(`🔀 custom redirect_url = ${redirectUrl}`);
    }

    // Spustíme pôvodný callback (overenie u providera, vytvorenie session, cookie…)
    await originalCallback(ctx);

    // Nakoniec prepis presmerovania
    if (redirectUrl) {
      strapi.log.info(`➡️ redirectujem užívateľa na ${redirectUrl}`);
      ctx.redirect(redirectUrl);
    }
  };

  return plugin;
};
