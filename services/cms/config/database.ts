/** Strapi's env helper exposes typed accessors, not just string lookup. */
interface Env {
  (key: string, fallback?: string): string;
  int(key: string, fallback?: number): number;
  bool(key: string, fallback?: boolean): boolean;
}

/**
 * The CMS owns editorial content in its own database. It never reaches into the commerce,
 * marketplace or ERP databases; the Experience API composes across them.
 */
export default ({ env }: { env: Env }) => {
  const client = env("DATABASE_CLIENT", "postgres");

  const connections = {
    postgres: {
      connection: {
        host: env("DATABASE_HOST", "postgres"),
        port: env.int("DATABASE_PORT", 5432),
        database: env("DATABASE_NAME", "buildkart_cms"),
        user: env("DATABASE_USERNAME"),
        password: env("DATABASE_PASSWORD"),
        ssl: env.bool("DATABASE_SSL", false) && {
          rejectUnauthorized: env.bool("DATABASE_SSL_REJECT_UNAUTHORIZED", true),
        },
      },
      pool: {
        min: env.int("DATABASE_POOL_MIN", 2),
        max: env.int("DATABASE_POOL_MAX", 10),
      },
    },
  };

  return {
    connection: {
      client,
      ...connections[client as keyof typeof connections],
      debug: false,
    },
  };
};
