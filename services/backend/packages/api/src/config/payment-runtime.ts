export const SIMULATED_PAYMENT_PROVIDER_ID = "pp_simulated_simulated";
export const RAZORPAY_PAYMENT_PROVIDER_ID = "pp_razorpay_razorpay";

export type PaymentAdapterMode = "simulated" | "provider";

export interface PaymentRuntime {
  environment: string;
  mode: PaymentAdapterMode;
  simulatedProviderEnabled: boolean;
  providerEnabled: boolean;
}

/**
 * Resolve the backend payment mode and fail closed before Medusa registers providers.
 * The simulated provider is permitted only in non-production environments.
 */
export function resolvePaymentRuntime(
  env: Record<string, string | undefined>,
): PaymentRuntime {
  const environment = (
    env.BUILDKART_ENVIRONMENT ?? env.NODE_ENV ?? "development"
  ).trim();
  const mode = (env.PAYMENT_ADAPTER_MODE ?? "simulated").trim();

  if (mode !== "simulated" && mode !== "provider") {
    throw new Error(`Unknown PAYMENT_ADAPTER_MODE: ${mode}`);
  }

  if (environment === "production" && mode === "simulated") {
    throw new Error(
      "Refusing to start Medusa: simulated payment provider is configured for production. " +
        "Simulated payment is development/staging only.",
    );
  }

  if (mode === "provider") {
    if (!env.RAZORPAY_KEY_ID?.trim() || !env.RAZORPAY_KEY_SECRET?.trim()) {
      throw new Error(
        "PAYMENT_ADAPTER_MODE=provider requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      );
    }
  }

  return {
    environment,
    mode,
    simulatedProviderEnabled: mode === "simulated",
    providerEnabled: mode === "provider",
  };
}
