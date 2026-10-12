/** Strapi's env helper exposes typed accessors, not just string lookup. */
interface Env {
  (key: string, fallback?: string): string;
  int(key: string, fallback?: number): number;
  array(key: string): string[];
}

export default ({ env }: { env: Env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  app: {
    keys: env.array("APP_KEYS"),
  },
  webhooks: {
    // Editorial publish webhooks notify the Experience API content adapter.
    populateRelations: false,
  },
});
