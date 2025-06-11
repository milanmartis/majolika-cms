declare module 'slugify' {
    interface SlugifyOptions {
      lower?: boolean;
      strict?: boolean;
      locale?: string;
    }
    function slugify(input: string, options?: SlugifyOptions): string;
    export = slugify;
  }