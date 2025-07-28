import { Context } from 'koa';

export default (plugin: any) => {
  // Uložíme si originálnu implementáciu callbacku
  const originalCallback = plugin.controllers.provider.callback;

  plugin.controllers.provider.callback = async (ctx: Context & { state: any }) => {
    const redirectUrl = ctx.query.redirect_url as string | undefined;

    // Uložíme požadovaný redirect do state
    if (redirectUrl) {
      ctx.state.redirectTo = redirectUrl;
    }

    // Spustíme originálnu akciu
    await originalCallback(ctx);

    // Po originálnej callback akcii prepíšeme redirect
    if (redirectUrl && ctx.response.header.location) {
      ctx.redirect(redirectUrl);
    }
  };

  return plugin;
};
