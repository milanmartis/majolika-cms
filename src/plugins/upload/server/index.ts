// src/plugins/upload/server/index.ts
import uploadPlugin from '@strapi/plugin-upload/server';
import sharp from 'sharp';

export default uploadPlugin({
  id: 'upload',            // ← NIKDY pluginPkg.name
  bootstrap({ strapi }) {
    const uploadService = strapi
      .plugin('upload')
      .service('upload');

    // Override transformer
    uploadService.getTransformer = () => ({
      async transform(buffer: Buffer, { width, height, format, quality }) {
        console.log('🖼️ transform called, EXIF rotate'); // <-- pre kontrolu
        let transformer = sharp(buffer).rotate();
        if (width || height) {
          transformer = transformer.resize(width, height, { fit: 'cover' });
        }
        transformer = transformer.toFormat(format, { quality });
        return transformer.toBuffer();
      },
    });
  },
});
