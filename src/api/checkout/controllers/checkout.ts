export default {
  async create(ctx) {
    const { body } = ctx.request;

    const result = await strapi.service('api::checkout.checkout').createSession(body);
    ctx.send(result);
  },
};