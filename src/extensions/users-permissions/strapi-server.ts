// src/extensions/users-permissions/strapi-server.ts
import type { Context } from 'koa';

export default (plugin: any) => {
  const authController = plugin.controllers.auth;

  if (typeof authController.callback !== 'function') {
    strapi.log.error('❌ users-permissions: auth.callback neexistuje');
    return plugin;
  }

  const orig = authController.callback.bind(authController);

  authController.callback = async (ctx: Context & { state: any }) => {
    // prečíta redirect_url (aktuálne adresu Angularu)
    const frontRedirect = ctx.query.redirect_url as string | undefined;
    if (frontRedirect) {
      ctx.state.redirectTo = frontRedirect;
      strapi.log.info(`🔀 custom redirect_url = ${frontRedirect}`);
    }

    // spusti originálny Strapi callback (overenie + cookies)
    await orig(ctx);

    // potom presmeruj na Angular
    if (frontRedirect) {
      strapi.log.info(`➡️ redirectujem na frontend: ${frontRedirect}`);
      ctx.redirect(frontRedirect);
    }
  };

  return plugin;
};