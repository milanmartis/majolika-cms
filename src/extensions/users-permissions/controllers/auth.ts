import pluginId from '@strapi/plugin-users-permissions/admin/src/pluginId';

export default (plugin) => {
  const defaultAuth = plugin.controllers.auth;

  // override len emailConfirmation
  plugin.controllers.auth.emailConfirmation = async (ctx) => {
    const { confirmation } = ctx.query;

    if (!confirmation) {
      return ctx.badRequest('Missing confirmation token');
    }

    try {
      const userService = strapi.plugins['users-permissions'].services.user;
      const user = await userService.fetch({ confirmationToken: confirmation });

      if (!user) {
        return ctx.badRequest('Invalid token');
      }

      if (user.confirmed) {
        return ctx.send({ status: 'already_confirmed' });
      }

      await userService.edit(user.id, {
        confirmed: true,
        confirmationToken: null,
      });

      return ctx.send({ status: 'confirmed' });
    } catch (err) {
      strapi.log.error('❌ Email confirmation failed', err);
      return ctx.internalServerError('Something went wrong');
    }
  };

  return plugin;
};
