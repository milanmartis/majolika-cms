// src/types/@strapi__plugin-upload/server.d.ts
declare module '@strapi/plugin-upload/server' {
    import { Strapi } from '@strapi/strapi';
    import { Plugin } from '@strapi/strapi/lib/core/strapi'; // alebo import zodpovedajúci vašej verzii
    const plugin: Plugin;
    export default plugin;
  }
  