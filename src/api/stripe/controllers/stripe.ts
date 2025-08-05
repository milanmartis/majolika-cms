export default {
  async webhook(ctx: any) {
    strapi.log.info('--- WEBHOOK CALLED ---');
    ctx.status = 200;
    ctx.body = { hello: 'world' };
    return;
  }
};