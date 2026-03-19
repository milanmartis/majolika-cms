'use strict';

declare const strapi: any;

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
};

export default {
  async registerWithTurnstile(ctx: any) {
    const { username, email, password, turnstileToken } = ctx.request.body;

    if (!username || !email || !password || !turnstileToken) {
      return ctx.badRequest('Chýbajú povinné polia.');
    }

    try {
      const normalizedUsername = String(username).trim();
      const normalizedEmail = String(email).trim().toLowerCase();

      const body = new URLSearchParams();
      body.append('secret', process.env.TURNSTILE_SECRET_KEY || '');
      body.append('response', turnstileToken);

      const forwardedFor = ctx.request.headers['x-forwarded-for'];
      const remoteIp = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : (forwardedFor || ctx.request.ip);

      if (remoteIp) {
        body.append('remoteip', remoteIp);
      }

      const verifyResponse = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        }
      );

      const verifyData = await verifyResponse.json() as TurnstileVerifyResponse;

      if (!verifyData.success) {
        strapi.log.warn('Turnstile verification failed', verifyData);
        return ctx.badRequest('Overenie ochrany proti botom zlyhalo.');
      }

      const existingUser = await strapi.db
        .query('plugin::users-permissions.user')
        .findOne({
          where: {
            $or: [
              { email: normalizedEmail },
              { username: normalizedUsername },
            ],
          },
        });

      if (existingUser) {
        return ctx.badRequest('Používateľ s týmto e-mailom alebo menom už existuje.');
      }

      const defaultRole = await strapi.db
        .query('plugin::users-permissions.role')
        .findOne({
          where: { type: 'authenticated' },
        });

      if (!defaultRole) {
        strapi.log.error('Default authenticated role not found.');
        return ctx.internalServerError('Predvolená rola nebola nájdená.');
      }

      const user = await strapi.plugins['users-permissions'].services.user.add({
        username: normalizedUsername,
        email: normalizedEmail,
        password,
        provider: 'local',
        confirmed: false,
        blocked: false,
        role: defaultRole.id,
      });

      try {
        await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
      } catch (emailError) {
        strapi.log.error('Confirmation email sending failed:', emailError);

        // user už je vytvorený, ale mail sa neposlal
        return ctx.internalServerError(
          'Účet bol vytvorený, ale nepodarilo sa odoslať potvrdzovací e-mail.'
        );
      }

      return ctx.send({
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      });
    } catch (err) {
      strapi.log.error('Register with Turnstile error:', err);
      return ctx.internalServerError('Registrácia zlyhala.');
    }
  },
};