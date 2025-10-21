declare module '@strapi/helper-plugin' {
    export function useNotification(): {
      toggleNotification: (opts: { type: 'success'|'warning'|'danger'|'info'; message: string }) => void;
    };
    export function useFetchClient(): {
      get: (url: string, cfg?: any) => Promise<any>;
      post: (url: string, body?: any, cfg?: any) => Promise<any>;
      put: (url: string, body?: any, cfg?: any) => Promise<any>;
      del: (url: string, cfg?: any) => Promise<any>;
    };
    export function useCMEditViewDataManager(): { initialData: any };
  }
  