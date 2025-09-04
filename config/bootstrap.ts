export default ({ env }) => {
  const cstr = env('DATABASE_URL');
  const host = env('DATABASE_HOST');
  console.log('[DB DEBUG] DATABASE_URL:', cstr ? '(set)' : '(empty)');
  console.log('[DB DEBUG] DATABASE_HOST:', host);

  const client = env('DATABASE_CLIENT', 'postgres');
  const connectionString = cstr;

  const postgres = {
    connection: connectionString
      ? {
          connectionString,
          ssl: env.bool('DATABASE_SSL', false) && {
            rejectUnauthorized: env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
          },
          schema: env('DATABASE_SCHEMA', 'public'),
        }
      : {
          host: env('DATABASE_HOST', '127.0.0.1'),
          port: env.int('DATABASE_PORT', 5432),
          database: env('DATABASE_NAME', 'strapi'),
          user: env('DATABASE_USERNAME', 'strapi'),
          password: env('DATABASE_PASSWORD', 'strapi'),
          ssl: env.bool('DATABASE_SSL', false) && {
            rejectUnauthorized: env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
          },
          schema: env('DATABASE_SCHEMA', 'public'),
        },
    pool: { min: env.int('DATABASE_POOL_MIN', 2), max: env.int('DATABASE_POOL_MAX', 10) },
  };

  return {
    connection: {
      client,
      ...postgres,
      acquireConnectionTimeout: env.int('DATABASE_CONNECTION_TIMEOUT', 60000),
    },
  };
};
