import customAuthController from './controllers/auth';

export default (plugin) => {
  plugin.controllers.auth.register = customAuthController.register;
  return plugin;
};