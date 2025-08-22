import type { Schema, Struct } from '@strapi/strapi';

export interface BlocksHeadingBlock extends Struct.ComponentSchema {
  collectionName: 'components_blocks_heading_blocks';
  info: {
    displayName: 'Heading Block';
  };
  attributes: {
    alignment: Schema.Attribute.Enumeration<['left', 'center', 'right']> &
      Schema.Attribute.DefaultTo<'left'>;
    fontSize: Schema.Attribute.Integer;
    level: Schema.Attribute.Enumeration<['H1', 'H2', 'H3', 'H4', 'H5', 'H6']> &
      Schema.Attribute.DefaultTo<'H2'>;
    text: Schema.Attribute.String;
  };
}

export interface BlocksImageBlock extends Struct.ComponentSchema {
  collectionName: 'components_blocks_image_blocks';
  info: {
    displayName: 'Image Block';
  };
  attributes: {
    alignment: Schema.Attribute.Enumeration<['left', 'center', 'right']> &
      Schema.Attribute.DefaultTo<'center'>;
    caption: Schema.Attribute.String;
    columns: Schema.Attribute.Enumeration<['one', 'two']> &
      Schema.Attribute.DefaultTo<'one'>;
    media: Schema.Attribute.Media & Schema.Attribute.Required;
  };
}

export interface BlocksLinkBlock extends Struct.ComponentSchema {
  collectionName: 'components_blocks_link_blocks';
  info: {
    displayName: 'Link Block';
  };
  attributes: {
    alignment: Schema.Attribute.Enumeration<['left', 'center', 'right']> &
      Schema.Attribute.DefaultTo<'left'>;
    fontSize: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<16>;
    openInNewTab: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    text: Schema.Attribute.String & Schema.Attribute.Required;
    url: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface BlocksTextBlock extends Struct.ComponentSchema {
  collectionName: 'components_blocks_text_blocks';
  info: {
    displayName: 'Text Block';
  };
  attributes: {
    alignment: Schema.Attribute.Enumeration<['left', 'center', 'right']> &
      Schema.Attribute.DefaultTo<'left'>;
    columns: Schema.Attribute.Enumeration<['one', 'two']> &
      Schema.Attribute.DefaultTo<'one'>;
    fontSize: Schema.Attribute.Integer;
    richBlocks: Schema.Attribute.Blocks;
    richText: Schema.Attribute.RichText;
  };
}

export interface BlocksVideoBlock extends Struct.ComponentSchema {
  collectionName: 'components_blocks_video_blocks';
  info: {
    displayName: 'Video Block';
  };
  attributes: {
    alignment: Schema.Attribute.Enumeration<['left', 'center', 'right']> &
      Schema.Attribute.DefaultTo<'center'>;
    caption: Schema.Attribute.String;
    height: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<315>;
    videoUrl: Schema.Attribute.String & Schema.Attribute.Required;
    width: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<560>;
  };
}

export interface CheckoutDeliveryDetails extends Struct.ComponentSchema {
  collectionName: 'components_checkout_delivery_details';
  info: {
    displayName: 'DeliveryDetails';
  };
  attributes: {
    notes: Schema.Attribute.Text;
    packetaBoxId: Schema.Attribute.String;
    postOfficeId: Schema.Attribute.String;
    provider: Schema.Attribute.String;
  };
}

export interface OrderItem extends Struct.ComponentSchema {
  collectionName: 'components_order_items';
  info: {
    icon: 'shopping-cart';
    name: 'item';
  };
  attributes: {
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    productName: Schema.Attribute.String & Schema.Attribute.Required;
    quantity: Schema.Attribute.Integer & Schema.Attribute.Required;
    unitPrice: Schema.Attribute.Decimal & Schema.Attribute.Required;
  };
}

export interface SharedAddress extends Struct.ComponentSchema {
  collectionName: 'components_shared_addresses';
  info: {
    description: 'User address';
    displayName: 'Address';
  };
  attributes: {
    city: Schema.Attribute.String;
    country: Schema.Attribute.String & Schema.Attribute.DefaultTo<'Slovakia'>;
    street: Schema.Attribute.String;
    zip: Schema.Attribute.String;
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
      'blocks.heading-block': BlocksHeadingBlock;
      'blocks.image-block': BlocksImageBlock;
      'blocks.link-block': BlocksLinkBlock;
      'blocks.text-block': BlocksTextBlock;
      'blocks.video-block': BlocksVideoBlock;
      'checkout.delivery-details': CheckoutDeliveryDetails;
      'order.item': OrderItem;
      'shared.address': SharedAddress;
      'shared.seo': SharedSeo;
    }
  }
}
