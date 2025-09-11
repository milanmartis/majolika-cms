// src/extensions/users-permissions/strapi-server.ts
import type { Context } from 'koa';

export default (plugin: any) => {
  strapi.log.info(
    `📦 users-permissions controllers: ${Object.keys(plugin.controllers).join(', ')}`
  );

  const authController = plugin.controllers.auth;

  // ===== Override: auth.callback (presmerovanie cez ?redirect_url=...) =====
  if (typeof authController?.callback === 'function') {
    const originalCallback = authController.callback.bind(authController);

    authController.callback = async (ctx: Context & { state: any }) => {
      const redirectUrl = ctx.query.redirect_url as string | undefined;
      if (redirectUrl) {
        ctx.state.redirectTo = redirectUrl;
        strapi.log.info(`🔀 custom redirect_url = ${redirectUrl}`);
      }

      await originalCallback(ctx);

      if (redirectUrl) {
        strapi.log.info(`➡️ redirectujem užívateľa na ${redirectUrl}`);
        ctx.redirect(redirectUrl);
      }
    };
  } else {
    strapi.log.error('❌ users-permissions: auth.callback neexistuje');
  }

  // ===== Override: auth.forgotPassword (pošleme len pre provider "local") =====
  if (typeof authController?.forgotPassword === 'function') {
    const originalForgot = authController.forgotPassword.bind(authController);

    authController.forgotPassword = async (ctx: Context) => {
      const safeOk = () => {
        // Vždy 200 a generická odpoveď – neodhaľujeme existenciu účtu
        (ctx as any).status = 200;
        (ctx as any).body = { ok: true };
      };

      try {
        const emailRaw = (ctx.request as any)?.body?.email;
        if (typeof emailRaw !== 'string' || !emailRaw.trim()) {
          return safeOk();
        }

        const email = emailRaw.trim().toLowerCase();

        // Hľadáme výlučne lokálny účet (email+heslo)
        const users = await strapi.entityService.findMany(
          'plugin::users-permissions.user',
          { filters: { email, provider: 'local' }, limit: 1, fields: ['id'] }
        );
        const user = users?.[0];

        if (!user) {
          // Neexistuje local účet -> NIČ NEPOSIELAME, len OK
          return safeOk();
        }

        // Existuje local účet -> využijeme pôvodnú logiku (vygeneruje token, odošle email)
        await originalForgot(ctx);

        // Zjednotíme odpoveď (ak by pôvodný controller nenastavil telo)
        if (!(ctx as any).body) safeOk();
      } catch (err: any) {
        strapi.log.error(`❌ forgotPassword override error: ${err?.message || err}`);
        // Aj pri chybe neodhaľujeme stav
        safeOk();
      }
    };
  } else {
    strapi.log.error('❌ users-permissions: auth.forgotPassword neexistuje');
  }

  return plugin;
};
