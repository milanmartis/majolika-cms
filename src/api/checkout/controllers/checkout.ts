export default {
  async create(ctx) {
    // Log, payload, atď.
    const result = await strapi.service('api::checkout.checkout').createSession(ctx.request.body);
    ctx.send(result);
  },
};