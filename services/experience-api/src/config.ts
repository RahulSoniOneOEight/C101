/**
 * Environment and adapter-mode configuration with the production fail-closed guard.
 *
 * Simulated payment is permitted only in development/staging. Production must refuse to
 * start when a simulated adapter is configured, so a misconfiguration cannot silently
 * manufacture payment acceptance.
 */

export type Environment = "development" | "integration" | "staging" | "production";
export type PaymentAdapterMode = "simulated" | "provider";

const ALLOWED_ENVIRONMENTS: Environment[] = [
  "development",
  "integration",
  "staging",
  "production",
];

function readEnvironment(raw: string | undefined): Environment {
  const value = (raw ?? "development").trim() as Environment;
  if (!ALLOWED_ENVIRONMENTS.includes(value)) {
    throw new Error(`Unknown BUILDKART_ENVIRONMENT: ${value}`);
  }
  return value;
}

function readAdapterMode(raw: string | undefined): PaymentAdapterMode {
  const value = (raw ?? "simulated").trim() as PaymentAdapterMode;
  if (value !== "simulated" && value !== "provider") {
    throw new Error(`Unknown PAYMENT_ADAPTER_MODE: ${value}`);
  }
  return value;
}

export interface Config {
  port: number;
  environment: Environment;
  paymentAdapterMode: PaymentAdapterMode;
  medusaBaseUrl: string;
  medusaPublishableKey: string;
  medusaRegionId: string;
  medusaCountryCode: string;
  trytonBaseUrl: string;
  trytonDatabase: string;
  trytonUsername: string;
  trytonPassword: string;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const environment = readEnvironment(env.BUILDKART_ENVIRONMENT);
  const paymentAdapterMode = readAdapterMode(env.PAYMENT_ADAPTER_MODE);

  // Fail closed: simulated payment must never run in production.
  if (environment === "production" && paymentAdapterMode === "simulated") {
    throw new Error(
      "Refusing to start: simulated payment adapter is configured for production. " +
        "Simulated payment is development/staging only.",
    );
  }

  // Provider mode requires an approved provider adapter that does not exist in this increment.
  if (paymentAdapterMode === "provider") {
    throw new Error(
      "Provider payment mode is not implemented in this increment (Razorpay is deferred). " +
        "Set PAYMENT_ADAPTER_MODE=simulated for staging.",
    );
  }

  return {
    port: Number.parseInt(env.PORT ?? "9020", 10),
    environment,
    paymentAdapterMode,
    medusaBaseUrl: env.MEDUSA_BASE_URL ?? "http://localhost:9010",
    medusaPublishableKey: env.MEDUSA_PUBLISHABLE_KEY ?? "",
    medusaRegionId: env.MEDUSA_REGION_ID ?? "",
    medusaCountryCode: env.MEDUSA_COUNTRY_CODE ?? "IN",
    trytonBaseUrl: env.TRYTON_BASE_URL ?? "http://localhost:8010",
    trytonDatabase: env.TRYTON_DATABASE ?? "buildkart_tryton",
    trytonUsername: env.TRYTON_USERNAME ?? "admin",
    trytonPassword: env.TRYTON_PASSWORD ?? "buildkart-staging-admin",
  };
}
