type Env = (key: string, fallback?: string) => string;

export default ({ env }: { env: Env & { int: (k: string, f?: number) => number; array: (k: string) => string[] } }) => ({
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
