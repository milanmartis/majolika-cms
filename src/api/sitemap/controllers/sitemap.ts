'use strict';

module.exports = {
  async index(ctx) {
    // FRONTEND_URL z .env – fallback na majolika.sk ak by nebolo nastavené
    const base = process.env.FRONTEND_URL || 'https://www.majolika.sk';

    // 1) Načítaj produkty (public)
    const products = await strapi.entityService.findMany('api::product.product', {
      fields: ['slug', 'updatedAt'],
      filters: { public: true },
      limit: 3000,
    });

    const urls = [];

    // --- statické stránky frontendu ---
    urls.push({
      loc: `${base}/`,
      changefreq: 'weekly',
      priority: '1.0',
    });

    urls.push({
      loc: `${base}/eshop`,
      changefreq: 'weekly',
      priority: '0.9',
    });

    urls.push({
      loc: `${base}/dielne`,
      changefreq: 'weekly',
      priority: '0.8',
    });

    // --- produkty ---
    products.forEach(p => {
      urls.push({
        loc: `${base}/product/${p.slug}`,
        changefreq: 'weekly',
        priority: '0.7',
        lastmod: p.updatedAt,
      });
    });

    const xmlItems = urls.map(u => {
      const lastmod = u.lastmod
        ? `<lastmod>${new Date(u.lastmod).toISOString().split('T')[0]}</lastmod>`
        : '';
      const changefreq = u.changefreq
        ? `<changefreq>${u.changefreq}</changefreq>`
        : '';
      const priority = u.priority
        ? `<priority>${u.priority}</priority>`
        : '';

      return `
  <url>
    <loc>${u.loc}</loc>
    ${lastmod}
    ${changefreq}
    ${priority}
  </url>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlItems.join('\n')}
</urlset>`.trim();

    ctx.set('Content-Type', 'application/xml');
    ctx.body = xml;
  },
};
