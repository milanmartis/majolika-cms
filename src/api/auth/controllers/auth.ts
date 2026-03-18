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
              { email: email.toLowerCase() },
              { username },
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
        return ctx.internalServerError('Predvolená rola nebola nájdená.');
      }

      const user = await strapi.plugins['users-permissions'].services.user.add({
        username,
        email: email.toLowerCase(),
        password,
        provider: 'local',
        confirmed: false,
        blocked: false,
        role: defaultRole.id,
      });

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