import { resolve } from 'path';
import sqlite3 from 'sqlite3';
import type { Context } from 'koa';

export default {
  register({ strapi }: any) {
    const userCt = strapi.contentType('plugin::users-permissions.user');
    userCt.attributes = {
      ...userCt.attributes,
      aktuality: {
        type: 'relation',
        relation: 'oneToMany',
        target: 'api::aktualita.aktualita',
        mappedBy: 'author',
      },
      product: {
        type: 'relation',
        relation: 'oneToMany',
        target: 'api::product.product',
        mappedBy: 'author',
      },
    };

    strapi.server.routes([
      {
        method: 'GET',
        path: '/api/products/picture-urls',
        handler: async (ctx: Context) => {
          const products = await strapi.db.query('api::product.product').findMany({
            select: ['picture'],
          });

          const urls = products.flatMap((p: any) =>
            p.picture
              ? String(p.picture)
                  .split(',')
                  .map((u) => u.trim())
                  .filter((u) => u)
              : []
          );

          ctx.body = { urls };
        },
        config: { auth: false },
      },
      {
        method: 'POST',
        path: '/api/webhooks/stripe',
        handler: async (ctx: Context) => {
          const secret = process.env.STRIPE_SECRET!;
          const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
          if (!secret || !webhookSecret) {
            ctx.throw(500, 'Missing Stripe env vars');
          }

          const StripePkg = await import('stripe');
          const Stripe = StripePkg.default;
          const stripe = new Stripe(secret, { apiVersion: '2025-04-30.basil' });

          const sig = ctx.request.headers['stripe-signature'];
          if (typeof sig !== 'string') {
            ctx.throw(400, 'Missing Stripe signature');
          }

          let event: any;
          try {
            event = stripe.webhooks.constructEvent(ctx.request.body, sig, webhookSecret);
          } catch (err: any) {
            ctx.throw(400, `Webhook Error: ${err.message}`);
          }

          if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const orders = await strapi.db.query('api::order.order').findMany({
              where: { paymentSessionId: session.id },
            });

            await Promise.all(
              orders.map((o: any) =>
                strapi.entityService.update('api::order.order', o.id, {
                  data: { paymentStatus: 'paid' },
                })
              )
            );
          }

          ctx.body = { received: true };
        },
        config: { auth: false },
      },
    ]);
  },

  async bootstrap({ strapi }: any) {
    const s = strapi.config.get('admin.auth.sessions');
    strapi.log.info('ADMIN SESSIONS EFFECTIVE = ' + JSON.stringify(s));

    await strapi.admin.services.role.createRolesIfNoneExist();

    const defaultPermissions = [
      { action: 'admin::create', subject: 'api::article.article', properties: {} },
      { action: 'admin::read', subject: 'api::article.article', properties: {} },
      { action: 'admin::update', subject: 'api::article.article', properties: {} },
      { action: 'admin::delete', subject: 'api::article.article', properties: {} },
    ];

    try {
      await strapi.db.query('admin::permission').createMany({
        data: defaultPermissions,
        skipDuplicates: true,
      });
      strapi.log.info('✅ Admin permissions seeded with createMany (duplicates skipped).');
    } catch (err: any) {
      strapi.log.warn('⚠️ Bulk seed zlyhalo, fallback na individuálne INSERTy: ', err.message);

      for (const perm of defaultPermissions) {
        const exists = await strapi.db
          .query('admin::permission')
          .findOne({ where: { action: perm.action, subject: perm.subject } });

        if (!exists) {
          await strapi.db.query('admin::permission').create({ data: perm });
          strapi.log.info(`    • permission created: ${perm.action} / ${perm.subject}`);
        }
      }
    }

    strapi.db.lifecycles.subscribe({
      models: ['plugin::upload.file'],
      async afterCreate(event: any) {
        const { id, url } = event.result as any;
        strapi.log.info(`[upload afterCreate] file ${id} created with url: ${url}`);
      },
    });

    if (process.env.DISABLE_SQLITE_IMPORT === 'true') {
      strapi.log.info('SQLite import logic skipped because DISABLE_SQLITE_IMPORT=true');
      return;
    }

    const dbPath = resolve(process.cwd(), '.tmp/data.db');
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) strapi.log.error('SQLite open error:', err.message);
      else strapi.log.info(`Connected to SQLite: ${dbPath}`);
    });

    const allAsync = (sql: string) =>
      new Promise<any[]>((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));

    void allAsync;

    // stará sqlite logika môže ostať zakomentovaná alebo ju sem doplníš neskôr
  },
};