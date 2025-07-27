export default (plugin) => {
    // 🔹 0) Vypneme defaultné posielanie e-mailu (nech nespamuje dvakrát)
    plugin.services.user.sendConfirmationEmail = async () => {
      strapi.log.info('🚫 Default Strapi confirmation email disabled');
      return;
    };
  
    // 🔹 1) Override REGISTER → po registrácii pošleme vlastný email s frontend linkom
    const defaultRegister = plugin.controllers.auth.register;
  
    plugin.controllers.auth.register = async (ctx, next) => {
      // najprv spusti default register
      await defaultRegister(ctx, next);
  
      const user = ctx.response?.body?.user;
      if (!user || user.confirmed) return;
  
      // ⬇ tu získame confirmationToken, ktorý Strapi už vygeneroval
      const fullUser = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: user.id },
        select: ['confirmationToken', 'email'],
      });
  
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      const confirmationLink = `${frontendUrl}/confirm-email?confirmation=${fullUser.confirmationToken}`;
  
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
  
    // 🔹 2) Override EMAIL CONFIRMATION → vráti JSON namiesto redirectu
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
  