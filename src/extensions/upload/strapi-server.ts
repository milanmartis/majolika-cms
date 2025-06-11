// src/extensions/upload/strapi-server.ts
import sharp from 'sharp';

type TransformOptions = {
  width?: number;
  height?: number;
  format: keyof sharp.FormatEnum;
  quality?: number;
};

export default (plugin: any) => {
  // Prepíšeme službu transformácie uploadu
  plugin.services.upload.getTransformer = () => {
    return {
      /**
       * buffer: pôvodné bajty obrázka
       * opts: špecifikácia resize/format
       */
      async transform(buffer: Buffer, opts: TransformOptions): Promise<Buffer> {
        // 1) otočíme podľa EXIF, 2) zmenšíme (ak treba), 3) prevedieme formát + kvalitu
        let transformer = sharp(buffer).rotate();

        if (opts.width || opts.height) {
          transformer = transformer.resize(opts.width, opts.height, {
            fit: 'cover',
          });
        }

        transformer = transformer.toFormat(opts.format, {
          quality: opts.quality,
        });

        return transformer.toBuffer();
      },
    };
  };

  return plugin;
};
