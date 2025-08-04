import slugify from 'slugify';

export default {
  beforeCreate(event) {
    const { data } = event.params;

    if (data.title && !data.slug) {
      data.slug = slugify(data.title, { lower: true, strict: true });
    }
  },
  beforeUpdate(event) {
    const { data } = event.params;

    if (data.title && !data.slug) {
      data.slug = slugify(data.title, { lower: true, strict: true });
    }
  },
};
