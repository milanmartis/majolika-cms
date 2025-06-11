import type { Schema, Struct } from '@strapi/strapi';

export interface OrderItem extends Struct.ComponentSchema {
  collectionName: 'components_order_items';
  info: {
    icon: 'shopping-cart';
    name: 'item';
  };
  attributes: {
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    quantity: Schema.Attribute.Integer & Schema.Attribute.Required;
    unitPrice: Schema.Attribute.Decimal & Schema.Attribute.Required;
  };
}

export interface SharedAddress extends Struct.ComponentSchema {
  collectionName: 'components_shared_address';
  info: {
    displayName: 'Address';
    icon: 'map-pin';
  };
  attributes: {
    city: Schema.Attribute.String & Schema.Attribute.Required;
    country: Schema.Attribute.String & Schema.Attribute.Required;
    street: Schema.Attribute.String & Schema.Attribute.Required;
    zipCode: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seo';
  info: {
    icon: 'globe';
    name: 'SEO';
  };
  attributes: {
    metaDescription: Schema.Attribute.Text;
    metaTitle: Schema.Attribute.String;
    shareImage: Schema.Attribute.Media<'images'>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'order.item': OrderItem;
      'shared.address': SharedAddress;
      'shared.seo': SharedSeo;
    }
  }
}
