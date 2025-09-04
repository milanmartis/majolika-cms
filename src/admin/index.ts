import register from './register';
import injectContentManager from './inject-content-manager';
import { InjectedCMEditView } from './containers/InjectedCMEditView';

export default {
  register,
  bootstrap(app: any) {
    // zaregistruj injection zóny
    // @ts-ignore
    app.registerHook('CM_InjectZone', injectContentManager);
    // zaregistruj komponent
    // @ts-ignore
    app.addComponents({ InjectedCMEditView });
  },
};
