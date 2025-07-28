// import type { Strapi } from '@strapi/strapi';
import type { Context } from 'koa';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

export default ({ strapi }) => ({
  async exchange(ctx: Context) {
    const { token } = ctx.request.body as { token?: string };
    if (!token) {
      return ctx.throw(400, 'Missing Google ID token');
    }

    // 1) Overenie ID tokenu u Google
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    let payload: TokenPayload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload() as TokenPayload;
    } catch (err) {
      strapi.log.error('Google token verification failed', err);
      return ctx.throw(401, 'Invalid Google ID token');
    }

    const email = payload.email!;
    // 2) fetch alebo create user
    const userService = strapi.plugin('users-permissions').service('user');
    const role = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'authenticated' } });

    let user = await userService.fetch({ email });
    if (!user) {
      user = await userService.add({
        email,
        username: email,
        provider: 'google',
        confirmed: true,
        blocked: false,
        role: role!.id,
      });
    }

    // 3) Vygenerovanie vlastného JWT
    const jwtService = strapi.plugin('users-permissions').service('jwt');
    const jwt = jwtService.issue({ id: user.id });

    // 4) Odošleme späť
    ctx.send({ jwt, user });
  },
});
