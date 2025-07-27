export default (plugin) => {
    //
    // 1️⃣  OVERRIDE REGISTER – po registrácii pošleme vlastný e‑mail
    //
    const originalRegister = plugin.controllers.auth.register;
  
    plugin.controllers.auth.register = async (ctx, next) => {
      // najprv spusti pôvodný register (vytvorí usera + uloží token)
      await originalRegister(ctx, next);
  
      const user = (ctx.response?.body as any)?.user;
      if (!user) return; // ak zlyhala registrácia
  
      // už potvrdený = nič neposielame
      if (user.confirmed) return;
  
      // 🔑 confirmationToken je defaultne uložený Strapi pri registrácii
      const dbUser = await strapi.query('plugin::users-permissions.user').findOne({
        where: { id: user.id },
        select: ['confirmationToken'],
      });
  
      const token = dbUser?.confirmationToken;
      if (!token) return;
  
      // FE URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      const confirmationLink = `${frontendUrl}/confirm-email?confirmation=${token}`;
  
      // Pošli vlastný e‑mail
      await strapi.plugin('email').service('email').send({
        to: user.email,
        subject: '✅ Potvrďte svoj email',
        text: `Kliknite na tento odkaz na potvrdenie účtu: ${confirmationLink}`,
        html: `
          <p>Ďakujeme za registráciu.</p>
          <p><a href="${confirmationLink}">➡ Kliknite sem pre potvrdenie emailu</a></p>
        `,
      });
  
      strapi.log.info(`📧 Custom confirmation email sent to ${user.email}`);
    };
  
    //
    // 2️⃣  OVERRIDE EMAIL CONFIRMATION – vrátime JSON namiesto redirectu
    //
    plugin.controllers.auth.emailConfirmation = async (ctx) => {
      const { confirmation } = ctx.query;
  
      if (!confirmation) {
        return ctx.badRequest('Missing confirmation token');
      }
  
      const user = await strapi
        .query('plugin::users-permissions.user')
        .findOne({ where: { confirmationToken: confirmation } });
  
      if (!user) {
        return ctx.badRequest('Invalid or expired token');
      }
  
      if (user.confirmed) {
        return ctx.send({ status: 'already_confirmed' });
      }
  
      await strapi.query('plugin::users-permissions.user').update({
        where: { id: user.id },
        data: { confirmed: true, confirmationToken: null },
      });
  
      return ctx.send({ status: 'confirmed' });
    };
  
    return plugin;
  };
  