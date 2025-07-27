export default {
    async register(ctx) {
      // zober pôvodný controller z pluginu
      const defaultAuthController = strapi.controller('plugin::users-permissions.auth').register;
  
      // zavoláme pôvodný register s fake next middleware
      await defaultAuthController(ctx, async () => {});
  
      // 🔧 TS fix: pretypujeme ctx.response.body
      const response = ctx.response.body as {
        user?: {
          id: number;
          email: string;
          confirmed: boolean;
        };
        jwt?: string;
      };
  
      const user = response?.user;
  
      if (user && !user.confirmed) {
        // token rovnaký ako používa default
        const jwt = await strapi
          .service('plugin::users-permissions.jwt')
          .issue({ id: user.id });
  
        const frontendUrl =
          process.env.FRONTEND_URL || 'http://localhost:4200';
  
        const confirmationLink = `${frontendUrl}/confirm-email?confirmation=${jwt}`;
  
        await strapi.plugin('email').service('email').send({
          to: user.email,
          subject: 'Potvrďte svoj email',
          text: `Kliknite na tento odkaz pre potvrdenie účtu: ${confirmationLink}`,
          html: `<p>Ďakujeme za registráciu!</p>
                 <p><a href="${confirmationLink}">Kliknite sem pre potvrdenie emailu</a></p>`,
        });
  
        strapi.log.info(`✅ Custom confirmation email sent to ${user.email}`);
      }
  
      return response; // vraciame pôvodný výsledok
    },
  };
  