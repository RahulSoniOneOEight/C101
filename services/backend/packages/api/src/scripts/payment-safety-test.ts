import assert from "node:assert/strict";
import { resolvePaymentRuntime } from "../config/payment-runtime";

assert.throws(
  () => resolvePaymentRuntime({
    BUILDKART_ENVIRONMENT: "production",
    PAYMENT_ADAPTER_MODE: "simulated",
  }),
  /Refusing to start Medusa/,
);

assert.equal(
  resolvePaymentRuntime({
    BUILDKART_ENVIRONMENT: "staging",
    PAYMENT_ADAPTER_MODE: "simulated",
  }).simulatedProviderEnabled,
  true,
);

assert.equal(
  resolvePaymentRuntime({
    BUILDKART_ENVIRONMENT: "production",
    PAYMENT_ADAPTER_MODE: "provider",
  }).simulatedProviderEnabled,
  false,
);

console.log("PASS: Medusa payment configuration fails closed in production.");
