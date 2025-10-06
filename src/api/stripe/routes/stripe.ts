export default {
  routes: [
    { method: 'GET',  path: '/payments/ping',    handler: 'api::stripe.stripe.ping',          config: { auth: false } },
    { method: 'POST', path: '/payments/create',  handler: 'api::stripe.stripe.create',        config: { auth: false } },
    { method: 'POST', path: '/payments/webhook', handler: 'api::stripe.stripe.webhook',       config: { auth: false } },
    { method: 'GET',  path: '/payments/return',  handler: 'api::stripe.stripe.returnBridge',  config: { auth: false } },
    { method: 'POST', path: '/payments/status',  handler: 'api::stripe.stripe.status',        config: { auth: false } },
  ],
};