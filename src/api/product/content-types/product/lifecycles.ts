import slugify from 'slugify';
// import type { Strapi } from '@strapi/strapi';

export default {
  /**
   * Before creating a new Product, if `slug` is not provided
   * generate it from the `name` using slugify.
   */
  async beforeCreate(event: { params: { data: Record<string, any> } }) {
    const { data } = event.params;
    if (data.name && !data.slug) {
      data.slug = slugify(data.name, { lower: true, strict: true });
    }
  },

  /**
   * Before updating a Product, if `slug` is not provided
   * regenerate it from the new `name`.
   */
  async beforeUpdate(event: { params: { data: Record<string, any> } }) {
    const { data } = event.params;
    if (data.name && !data.slug) {
      data.slug = slugify(data.name, { lower: true, strict: true });
    }
  },
};