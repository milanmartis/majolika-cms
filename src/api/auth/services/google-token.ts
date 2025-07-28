// import type { Strapi } from '@strapi/core';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

export default ({ strapi }) => ({
  async verifyAndGetUser(token: string) {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload() as TokenPayload;
    const email = payload.email!;

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
    return user;
  },
});
