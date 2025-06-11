import { resolve } from 'path';
import sqlite3 from 'sqlite3';
import type { Context } from 'koa';

export default {
  register({ strapi }: any) {
    // Rozšíření User CT o vztahy
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

    // Endpoint returning JSON list of all picture URLs from products
    strapi.server.routes([
      {
        method: 'GET',
        path: '/api/products/picture-urls',
        handler: async (ctx: Context) => {
          // Fetch all products with picture column
          const products = await strapi.db.query('api::product.product').findMany({
            select: ['picture'],
          });
          // Collect and split CSV values
          const urls = products.flatMap(p =>
            p.picture
              ? (p.picture as string).split(',').map(u => u.trim()).filter(u => u)
              : []
          );
          ctx.body = { urls };
        },
        config: { auth: false },
      },
      // Stripe webhook route
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
    // Lifecycle hook: remove original image, keep formats
    strapi.db.lifecycles.subscribe({
      models: ['plugin::upload.file'],
      async afterCreate(event: any) {
        const { id, url, formats } = event.result as any;
        if (!formats || !url) return;

        const provider = strapi.plugin('upload').provider as any;
        let key: string;
        try {
          const parsed = new URL(url);
          key = parsed.pathname.replace(/^\//, '');
        } catch {
          key = url.replace(/^\//, '');
        }

        try {
          await provider.delete({ key });
          strapi.log.info(`Deleted original: ${key}`);
        } catch (e: any) {
          strapi.log.error('Delete original failed:', e);
        }

        const firstUrl = (Object.values(formats)[0] as any).url || null;
        try {
          await strapi.db.query('plugin::upload.file').update({
            where: { id },
            data: { url: firstUrl },
          });
          strapi.log.info(`DB url set to ${firstUrl}`);
        } catch (e: any) {
          strapi.log.error('Update DB url failed:', e);
        }
      },
    });

    // SQLite import logic
    const dbPath = resolve(process.cwd(), '.tmp/data.db');
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, err => {
      if (err) strapi.log.error('SQLite open error:', err.message);
      else strapi.log.info(`Connected to SQLite: ${dbPath}`);
    });

    const allAsync = (sql: string) =>
      new Promise<any[]>((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));

    // try {
      // Import categories
      // const legacyCategories: Array<{
      //   term_id: number;
      //   category_name: string;
      //   category_slug: string;
      //   parent_term_id: number | null;
      // }> = await allAsync(
      //   'SELECT term_id, category_name, category_slug, parent_term_id FROM categories'
      // ) as any[];

      // const termToCategoryId = new Map<number, number>();

      // // Create categories without parent first
      // for (const { term_id, category_name, category_slug } of legacyCategories) {
      //   if (termToCategoryId.has(term_id)) continue;
      //   const created = await strapi.entityService.create('api::category.category', {
      //     data: {
      //       term_id,
      //       category_name,
      //       category_slug,
      //     },
      //   });
      //   termToCategoryId.set(term_id, created.id);
      // }

      // // Update parent relations
      // for (const { term_id, parent_term_id } of legacyCategories) {
      //   if (!parent_term_id) continue;
      //   const id = termToCategoryId.get(term_id);
      //   const parentId = termToCategoryId.get(parent_term_id);
      //   if (id && parentId) {
      //     await strapi.entityService.update('api::category.category', id, {
      //       data: { parent: parentId },
      //     });
      //   }
      // }
      // strapi.log.info('Category import done');

      // // Import product-category relations
      // const pivotRows: Array<{ product_id: number; term_ids: string }> =
      //   await allAsync('SELECT product_id, term_ids FROM products_in_categories') as any[];

      // for (const { product_id, term_ids } of pivotRows) {
      //   const prod = await strapi.db
      //     .query('api::product.product')
      //     .findOne({ where: { externalId: product_id } });

      //   if (!prod || !term_ids) {
      //     continue;
      //   }

      //   const termIds = term_ids
      //     .split(',')
      //     .map(s => parseInt(s.trim(), 10))
      //     .filter(n => !isNaN(n));

      //   const categoryRelations: { id: number }[] = [];
      //   for (const termId of termIds) {
      //     const cat = await strapi.db
      //       .query('api::category.category')
      //       .findOne({ where: { term_id: termId } });
      //     if (cat) {
      //       categoryRelations.push({ id: cat.id });
      //     }
      //   }

      //   if (categoryRelations.length === 0) {
      //     continue;
      //   }

      //   await strapi.entityService.update('api::product.product', prod.id, {
      //     data: {
      //       categories: {
      //         set: categoryRelations,
      //       },
      //     },
      //   });
      // }
      // strapi.log.info('Product-category relations imported');

      // Synchronize media relations from product.picture
      // const products = await strapi.db.query('api::product.product').findMany({ select: ['id','picture'] });
      // strapi.log.info(`Sync images for ${products.length} products`);
  //     for (const prod of products) {
  //       if (!prod.picture) continue;
  //       const urls = prod.picture.split(',').map((u: string) => u.trim()).filter(Boolean);
  //       if (!urls.length) continue;

  //       // find file IDs by matching base filename
  //       const fileIds: number[] = [];
  //       for (const u of urls) {
  //         const name = (() => {
  //           try { return decodeURIComponent(new URL(u).pathname.split('/').pop()!); }
  //           catch { return u.split('/').pop()!; }
  //         })();
  //         const base = name.includes('_') ? name.split('_').pop()! : name;
  //         const file = await strapi.db.query('plugin::upload.file').findOne({ where: { name: { $endsWith: base } } });
  //         if (file) fileIds.push(file.id);
  //       }
  //       if (!fileIds.length) continue;

  //       await strapi.entityService.update('api::product.product', prod.id, {
  //         data: {
  //           picture_new: fileIds[0],
  //           pictures_new: fileIds.slice(1).map(id => ({ id })),
  //         },
  //       });
  //     }
  //     strapi.log.info('Image sync done');
  //   } catch (err) {
  //     strapi.log.error('Error:', err);
  //   } finally {
  //     db.close(e => e ? strapi.log.error('DB close error', e) : strapi.log.info('SQLite closed'));
  //   }
  },
};
