export default (plugin) => {
    const defaultAuth = plugin.controllers.auth;
  
    // override len emailConfirmation
    plugin.controllers.auth.emailConfirmation = async (ctx) => {
      const { confirmation } = ctx.query;
  
      if (!confirmation) {
        return ctx.badRequest('Missing confirmation token');
      }
  
      try {
        // fetch user podľa confirmation tokenu
        const user = await strapi
          .query('plugin::users-permissions.user')
          .findOne({ where: { confirmationToken: confirmation } });
  
        if (!user) {
          return ctx.badRequest('Invalid or expired token');
        }
  
        // ak už je potvrdený → pošleme info
        if (user.confirmed) {
          return ctx.send({ status: 'already_confirmed' });
        }
  
        // inak nastavíme confirmed = true
        await strapi
          .query('plugin::users-permissions.user')
          .update({
            where: { id: user.id },
            data: {
              confirmed: true,
              confirmationToken: null,
            },
          });
  
        return ctx.send({ status: 'confirmed' });
      } catch (err) {
        strapi.log.error('❌ Email confirmation failed', err);
        return ctx.internalServerError('Something went wrong');
      }
    };
  
    return plugin;
  };
  