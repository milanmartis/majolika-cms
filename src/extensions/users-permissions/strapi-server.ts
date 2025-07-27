export default (plugin) => {
    const originalRegister = plugin.controllers.auth.register;
  
    plugin.controllers.auth.register = async (ctx, next) => {
      // najprv spusti pôvodný register
      await originalRegister(ctx, next);
  
      const user = (ctx.response?.body as any)?.user;
  
      if (!user) {
        return; // chyba pri registrácii
      }
  
      // ak už potvrdený, nič neposielame
      if (user.confirmed) {
        return;
      }
  
      // vygeneruj vlastný token ako Strapi
      const jwt = await strapi
        .service('plugin::users-permissions.jwt')
        .issue({ id: user.id });
  
      // frontend URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  
      const confirmationLink = `${frontendUrl}/confirm-email?confirmation=${jwt}`;
  
      // pošli vlastný mail
      await strapi.plugin('email').service('email').send({
        to: user.email,
        subject: '✅ Potvrďte svoj email',
        text: `Kliknite na tento odkaz na potvrdenie účtu: ${confirmationLink}`,
        html: `<p>Ďakujeme za registráciu.</p>
               <p><a href="${confirmationLink}">➡ Kliknite sem pre potvrdenie emailu</a></p>`,
      });
  
      strapi.log.info(`📧 Custom confirmation email sent to ${user.email}`);
    };
  
    return plugin;
  };
  