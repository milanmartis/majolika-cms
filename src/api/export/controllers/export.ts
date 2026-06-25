import ExcelJS from 'exceljs';

export default {
  async products(ctx) {
    const token = ctx.query.token;

    if (!process.env.EXPORT_SECRET || token !== process.env.EXPORT_SECRET) {
    return ctx.unauthorized('Unauthorized');
    }
    const products = await strapi.documents('api::product.product').findMany({
      locale: 'sk',
      populate: {
        categories: true,
        autor: true,
        tvar: true,
        dekory: true,
        picture_new: true,
        pictures_new: true,
        parent: true,
        variations: true,
      },
      filters: {
        public: true,
      },
      pagination: {
        pageSize: 10000,
      },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Produkty');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 25 },
      { header: 'External ID', key: 'externalId', width: 15 },
      { header: 'Názov', key: 'name', width: 40 },
      { header: 'Slug', key: 'slug', width: 40 },
      { header: 'EAN', key: 'ean', width: 20 },

      { header: 'Typ produktu', key: 'type', width: 18 },
      { header: 'ID rodiča', key: 'parentId', width: 25 },
      { header: 'Názov rodiča', key: 'parentName', width: 40 },
      { header: 'Variant', key: 'variable', width: 30 },
      { header: 'Počet variantov', key: 'variationsCount', width: 15 },

      { header: 'Krátky popis', key: 'short', width: 50 },
      { header: 'Popis', key: 'describe', width: 80 },

      { header: 'Cena', key: 'price', width: 15 },
      { header: 'Cena retail net', key: 'price_retail_net', width: 18 },
      { header: 'Cena 2026', key: 'price_new_2026', width: 15 },
      { header: 'Zľavnená cena', key: 'price_sale', width: 15 },
      { header: 'DPH %', key: 'vatPercentage', width: 10 },

      { header: 'Kategórie', key: 'categories', width: 40 },
      { header: 'Autor', key: 'autor', width: 25 },
      { header: 'Tvar', key: 'tvar', width: 25 },
      { header: 'Dekory', key: 'dekory', width: 40 },

      { header: 'Výška cm', key: 'vyska_cm', width: 12 },
      { header: 'Šírka cm', key: 'sirka_cm', width: 12 },
      { header: 'Hĺbka cm', key: 'hlbka_cm', width: 12 },
      { header: 'Objem ml', key: 'objem_ml', width: 12 },
      { header: 'Váha g', key: 'vaha_g', width: 12 },

      { header: 'Hlavný obrázok', key: 'picture_new', width: 70 },
      { header: 'Ďalšie obrázky', key: 'pictures_new', width: 100 },

      { header: 'Verejný', key: 'public', width: 10 },
      { header: 'Novinka', key: 'isNew', width: 10 },
      { header: 'V zľave', key: 'inSale', width: 10 },
      { header: 'Vypredané', key: 'isSoldOut', width: 10 },
      { header: 'Nedostupné', key: 'isUnavailable', width: 12 },
    ];

    const baseUrl =
      process.env.PUBLIC_URL ||
      process.env.STRAPI_URL ||
      'https://majolika-cms.appdesign.sk';

    for (const product of products as any[]) {
      const mainImage = product.picture_new?.url
        ? product.picture_new.url.startsWith('http')
          ? product.picture_new.url
          : `${baseUrl}${product.picture_new.url}`
        : '';

      const galleryImages = Array.isArray(product.pictures_new)
        ? product.pictures_new
            .map((img) => {
              if (!img?.url) return '';
              return img.url.startsWith('http') ? img.url : `${baseUrl}${img.url}`;
            })
            .filter(Boolean)
            .join(' ')
        : '';

      sheet.addRow({
        id: product.documentId || product.id,
        externalId: product.externalId || '',
        name: product.name || '',
        slug: product.slug || '',
        ean: product.ean || '',

        type: product.type || '',
        parentId: product.parent?.documentId || product.parent?.id || '',
        parentName: product.parent?.name || '',
        variable: product.variable || '',
        variationsCount: Array.isArray(product.variations)
          ? product.variations.length
          : 0,

        short: product.short || '',
        describe: product.describe || '',

        price: product.price || '',
        price_retail_net: product.price_retail_net || '',
        price_new_2026: product.price_new_2026 || '',
        price_sale: product.price_sale || '',
        vatPercentage: product.vatPercentage || '',

        categories: product.categories?.map((c) => c.name).join(', ') || '',
        autor: product.autor?.name || product.autor?.meno || '',
        tvar: product.tvar?.name || product.tvar?.nazov || '',
        dekory: product.dekory?.map((d) => d.name || d.nazov).join(', ') || '',

        vyska_cm: product.vyska_cm || '',
        sirka_cm: product.sirka_cm || '',
        hlbka_cm: product.hlbka_cm || '',
        objem_ml: product.objem_ml || '',
        vaha_g: product.vaha_g || '',

        picture_new: mainImage,
        pictures_new: galleryImages,

        public: product.public ? 'áno' : 'nie',
        isNew: product.isNew ? 'áno' : 'nie',
        inSale: product.inSale ? 'áno' : 'nie',
        isSoldOut: product.isSoldOut ? 'áno' : 'nie',
        isUnavailable: product.isUnavailable ? 'áno' : 'nie',
      });
    }

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: 'A1',
      to: 'AF1',
    };

    ctx.set(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    ctx.set(
      'Content-Disposition',
      'attachment; filename=produkty-export.xlsx'
    );

    const buffer = await workbook.xlsx.writeBuffer();
    ctx.body = Buffer.from(buffer);
  },
};