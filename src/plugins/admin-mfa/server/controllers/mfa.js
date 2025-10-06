import rate from '../utils/rate.js';

export default ({ strapi }) => ({
  async setup(ctx) {
    const admin = ctx.state.admin;
    if (!admin) return ctx.unauthorized();
    const svc = strapi.plugin('admin-mfa').service('mfa');
    ctx.body = await svc.startSetup(admin);
  },

  async enable(ctx) {
    const admin = ctx.state.admin;
    if (!admin) return ctx.unauthorized();
    const { code } = ctx.request.body || {};
    const svc = strapi.plugin('admin-mfa').service('mfa');
    try {
      ctx.body = await svc.enable(admin.id, code);
    } catch (e) {
      if (e.message === 'INVALID_CODE') return ctx.badRequest('Invalid code');
      if (e.message === 'SETUP_NOT_STARTED') return ctx.badRequest('Setup not started');
      throw e;
    }
  },

  async disable(ctx) {
    const admin = ctx.state.admin;
    if (!admin) return ctx.unauthorized();
    const svc = strapi.plugin('admin-mfa').service('mfa');
    await svc.disable(admin.id);
    ctx.body = { ok: true };
  },

  async verify(ctx) {
    // pre-2FA stav: použijeme dočasný token z override loginu
    const pre = ctx.state?.auth?.credentials?.pre2fa && ctx.state?.admin;
    if (!pre) return ctx.unauthorized('Not in pre-2FA state');

    // rate limit
    const ip = (ctx.request.headers['x-forwarded-for']?.toString().split(',')[0].trim()) || ctx.request.ip || 'unknown';
    if (!rate.limit(`admin-mfa:verify:${ctx.state.admin.id}:${ip}`, 5, 60_000)) {
      ctx.status = 429; ctx.body = { error: 'Too many attempts. Try again later.' }; return;
    }

    const { mfaCode } = ctx.request.body || {};
    const svc = strapi.plugin('admin-mfa').service('mfa');
    const ok = await svc.verifyTotp(ctx.state.admin.id, mfaCode);
    if (!ok) return ctx.badRequest('Invalid code');

    // TODO(admin token): vydaj finálny ADMIN token rovnako ako pôvodný /admin/login
    // Zvyčajne je v ctx.body, ktorý vracia original login, napr. { data: { token, user } }
    // Tu ho musíme vydať manuálne zo služby admin tokenov:
    // const token = await strapi.admin.services.token.createToken(admin);  // príklad – názov sa môže líšiť podľa verzie
    // ctx.body = { data: { token, user: ctx.state.admin } };

    // Fallback (ak nemáš hneď službu tokenu): vráť rovnaký tvar, aký používa tvoja verzia adminu:
    ctx.body = { data: { token: await strapi.admin.services.token.createToken(ctx.state.admin), user: ctx.state.admin } };
  },

  async recovery(ctx) {
    const pre = ctx.state?.auth?.credentials?.pre2fa && ctx.state?.admin;
    if (!pre) return ctx.unauthorized('Not in pre-2FA state');

    // rate limit
    const ip = (ctx.request.headers['x-forwarded-for']?.toString().split(',')[0].trim()) || ctx.request.ip || 'unknown';
    if (!rate.limit(`admin-mfa:recovery:${ctx.state.admin.id}:${ip}`, 5, 60_000)) {
      ctx.status = 429; ctx.body = { error: 'Too many attempts. Try again later.' }; return;
    }

    const { backupCode } = ctx.request.body || {};
    const svc = strapi.plugin('admin-mfa').service('mfa');
    const ok = await svc.tryRecovery(ctx.state.admin.id, backupCode);
    if (!ok) return ctx.badRequest('Invalid or used code');

    // TODO(admin token): viď poznámku vyššie
    ctx.body = { data: { token: await strapi.admin.services.token.createToken(ctx.state.admin), user: ctx.state.admin } };
  },
});
