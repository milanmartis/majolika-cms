export default (plugin) => {
    // Override emailConfirmation endpoint
    plugin.controllers.auth.emailConfirmation = async (ctx) => {
      const { confirmation } = ctx.query;
  
      if (!confirmation) {
        return ctx.badRequest('Missing confirmation token');
      }
  
      // Nájdeme usera podľa confirmationToken
      const user = await strapi
        .query('plugin::users-permissions.user')
        .findOne({ where: { confirmationToken: confirmation } });
  
      if (!user) {
        return ctx.badRequest('Invalid or expired token');
      }
  
      // Ak už je confirmed → vrátime "already_confirmed"
      if (user.confirmed) {
        return ctx.send({ status: 'already_confirmed' });
      }
  
      // Inak ho potvrdíme
      await strapi.query('plugin::users-permissions.user').update({
        where: { id: user.id },
        data: { confirmed: true, confirmationToken: null },
      });
  
      return ctx.send({ status: 'confirmed' });
    };
  
    return plugin;
  };
  