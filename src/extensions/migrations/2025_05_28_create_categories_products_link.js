// napr. src/extensions/migrations/2025_05_28_create_categories_products_link.js
export default async ({ strapi }) => {
    const knex = strapi.db.connection;
    const exists = await knex.schema.hasTable('categories_products_lnk');
    if (!exists) {
      await knex.schema.createTable('categories_products_lnk', table => {
        table.integer('categories_id').notNullable();
        table.integer('products_id').notNullable();
        table.primary(['categories_id','products_id']);
        table
          .foreign('categories_id')
          .references('id')
          .inTable('categories')
          .onDelete('CASCADE');
        table
          .foreign('products_id')
          .references('id')
          .inTable('products')
          .onDelete('CASCADE');
      });
    }
  };
  