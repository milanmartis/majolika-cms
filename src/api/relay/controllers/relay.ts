export default {
    async go(ctx) {
      const fe = 'https://www.majolika.sk/connect/google/redirect';
      const { access_token, error } = ctx.query as Record<string, string | undefined>;
      if (error) return ctx.redirect(`${fe}#error=${encodeURIComponent(error)}`);
      if (!access_token) return ctx.redirect(`${fe}#error=missing_token`);
      return ctx.redirect(`${fe}#access_token=${encodeURIComponent(access_token)}`);
    },
  };
  