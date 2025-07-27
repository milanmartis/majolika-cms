export default (plugin) => {
    // 0️⃣ Najprv vypni defaultné posielanie confirm mailu
    plugin.services.user.sendConfirmationEmail = async () => {
      strapi.log.info('🚫 Default Strapi confirmation email disabled');
      return;
    };
  
    // 1️⃣ Override REGISTER → po registrácii pošleme VLASTNÝ email s frontend linkom
    const defaultRegister = plugin.controllers.auth.register;
  
    plugin.controllers.auth.register = async (ctx, next) => {
      await defaultRegister(ctx, next);
  
      const user = ctx.response?.body?.user;
      if (!user || user.confirmed) return;
  
      // Vygeneruj JWT token
      const jwt = await strapi.service('plugin::users-permissions.jwt').issue({ id: user.id });
  
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      const confirmationLink = `${frontendUrl}/confirm-email?confirmation=${jwt}`;
  
      // Pošli vlastný email
      await strapi.plugin('email').service('email').send({
        to: user.email,
        subject: '✅ Confirm your email',
        html: `
          <p>Thanks for registering!</p>
          <p><a href="${confirmationLink}">➡ Click here to confirm your email</a></p>
        `,
      });
  
      strapi.log.info(`📧 Custom confirmation email sent to ${user.email}`);
    };
  
    // 2️⃣ Override EMAIL CONFIRMATION → vždy vráti JSON
    plugin.controllers.auth.emailConfirmation = async (ctx) => {
      const { confirmation } = ctx.query;
  
      if (!confirmation) return ctx.badRequest('Missing confirmation token');
  
      const user = await strapi
        .query('plugin::users-permissions.user')
        .findOne({ where: { confirmationToken: confirmation } });
  
      if (!user) return ctx.badRequest('Invalid or expired token');
  
      if (user.confirmed) return ctx.send({ status: 'already_confirmed' });
  
      await strapi.query('plugin::users-permissions.user').update({
        where: { id: user.id },
        data: { confirmed: true, confirmationToken: null },
      });
  
      return ctx.send({ status: 'confirmed' });
    };
  
    return plugin;
  };
  