declare module 'koa-bodyparser' {
    interface RawOptions {
      type?: string | string[];
      // ... prípadne ďalšie polia, ktoré potrebujete
    }
    export function raw(opts?: RawOptions): any;
  }