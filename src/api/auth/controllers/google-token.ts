import { OAuth2Client, TokenPayload } from 'google-auth-library';

export default {
  // názov musí byť presne "callback"
  callback: async (ctx) => {
    const { token } = ctx.request.body as { token: string };
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload() as TokenPayload;

    // ‑‑ tu vytvor alebo načítaj svojho užívateľa v DB a vydaj jwt …
    const { jwt, user } = await strapi
      .plugin('users-permissions')
      .service('jwt')
      .issue({ /* … payload … */ });

    ctx.body = { jwt, user };
  },
};