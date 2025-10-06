export default [
    { method: 'POST', path: '/admin/mfa/setup', handler: 'mfa.setup', config: { auth: { scope: ['admin'] } } },
    { method: 'POST', path: '/admin/mfa/enable', handler: 'mfa.enable', config: { auth: { scope: ['admin'] } } },
    { method: 'POST', path: '/admin/mfa/disable', handler: 'mfa.disable', config: { auth: { scope: ['admin'] } } },
    // tieto dve používajú dočasný pre-2FA token z login override
    { method: 'POST', path: '/admin/mfa/verify', handler: 'mfa.verify', config: { auth: true } },
    { method: 'POST', path: '/admin/mfa/recovery', handler: 'mfa.recovery', config: { auth: true } }
  ];
      