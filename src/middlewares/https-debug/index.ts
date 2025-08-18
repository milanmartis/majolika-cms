export default () => {
    return async (ctx, next) => {
      if (ctx.path.startsWith('/api/connect/google')) {
        const h = ctx.request.headers;
        console.log('[HTTPS-DEBUG]',
          'ctx.secure=', ctx.secure,
          'x-forwarded-proto=', h['x-forwarded-proto'],
          'x-forwarded-host=', h['x-forwarded-host'],
          'x-forwarded-port=', h['x-forwarded-port'],
          'host=', h['host']
        );
      }
      await next();
    };
  };
  