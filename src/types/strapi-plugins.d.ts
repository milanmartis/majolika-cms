// src/types/strapi-plugins.d.ts

// JSON importy
declare module '*.json' {
    const value: any;
    export default value;
  }
  
  // Upload-plugin “server” modul
  declare module '@strapi/plugin-upload/server' {
    const plugin: any;
    export default plugin;
  }
  
  // (Pridajte sem ďalšie “declare module” ak budete importovať aj iné
  //  ne-TS moduly, napr. '@strapi/plugin-foo/server', atď.)
  