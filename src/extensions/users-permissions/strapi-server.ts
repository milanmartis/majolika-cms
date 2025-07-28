import type { Context } from 'koa';

export default (plugin: any) => {
  // 1) Skontrolujme, že auth.callback existuje
  if (typeof plugin.controllers.auth?.callback !== 'function') {
    strapi.log.error('❌ users-permissions: auth.callback neexistuje');
    return plugin;
  }

  // 2) Ulož originálnu metódu
  const original = plugin.controllers.auth.callback.bind(plugin.controllers.auth);

  // 3) Prepíš callback
  plugin.controllers.auth.callback = async (ctx: Context & { state: any }) => {
    const target = ctx.query.redirect_url as string | undefined;
    if (target) {
      ctx.state.redirectTo = target;
      strapi.log.info(`🔀 custom redirect_url = ${target}`);
    }

    // 4) Spusti pôvodnú logiku Strapi
    await original(ctx);

    // 5) Po úspechu prepíš redirect na front‑end
    if (target) {
      strapi.log.info(`➡️ redirectujem na ${target}`);
      ctx.redirect(target);
    }
  };

  return plugin;
};