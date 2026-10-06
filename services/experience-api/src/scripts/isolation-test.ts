import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadConfig } from "../config.js";

/**
 * E-017-020 environment routing and production-effect isolation evidence.
 *
 * Proves unsafe routing and simulated payment in production fail closed, that staging routing is
 * local and credential-free, that provider markers are visible, and that the simulated adapters make
 * no network calls (so production providers are unreachable from the pilot).
 */

const config = loadConfig(process.env);
const BASE = `http://localhost:${config.port}`;

async function getJson<T>(path: string): Promise<{ status: number; body: T }> {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, body: (await r.json()) as T };
}

function assertNoNetwork(sourcePath: string): void {
  const source = readFileSync(sourcePath, "utf8");
  const forbidden = ["fetch(", "axios", "http.request", "https.request", "require(\"http", "require('http"];
  for (const token of forbidden) {
    assert.ok(!source.includes(token), `${sourcePath} must not use ${token} (no network in simulated adapters)`);
  }
}

try {
  // 1. Production + simulated payment fails closed (Experience API configuration).
  assert.throws(
    () => loadConfig({ BUILDKART_ENVIRONMENT: "production", PAYMENT_ADAPTER_MODE: "simulated" }),
    /Refusing to start/,
    "production + simulated must be refused",
  );
  // Provider mode is not implemented, so it cannot silently route to a real provider either.
  assert.throws(
    () => loadConfig({ BUILDKART_ENVIRONMENT: "production", PAYMENT_ADAPTER_MODE: "provider" }),
    /not implemented/i,
  );

  // 2. Staging markers are visible so a client can always tell staging from production.
  const health = await getJson<{ environment: string; payment_mode: string; test_data: boolean }>("/health");
  assert.equal(health.body.environment, "staging");
  assert.equal(health.body.payment_mode, "simulated");
  assert.equal(health.body.test_data, true);

  // 3. Routing is local and credential-free; providers are simulated; release is not authorized.
  const env = await getJson<{
    routing: Record<string, string>;
    providers: Record<string, string>;
    production_release_authorized: boolean;
    test_data: boolean;
  }>("/v1/admin/environment");
  assert.equal(env.status, 200);
  for (const [name, host] of Object.entries(env.body.routing)) {
    assert.ok(host.startsWith("localhost") || host.startsWith("127.0.0.1"), `${name} must be local, got ${host}`);
  }
  assert.deepEqual(env.body.providers, { payment: "simulated", otp: "simulated", logistics: "simulated" });
  assert.equal(env.body.production_release_authorized, false);
  assert.equal(env.body.test_data, true);

  // 4. No secrets leak in the routing payload.
  const raw = JSON.stringify(env.body);
  for (const secret of ["buildkart-staging-admin", "buildkart:buildkart", "password"]) {
    assert.ok(!raw.includes(secret), `routing payload must not contain '${secret}'`);
  }

  // 5. Composed responses carry staging/test markers.
  const product = await getJson<{ products: { id: string }[] }>("/v1/products?limit=1");
  const detail = await getJson<{ environment: string; test_data: boolean }>(
    `/v1/products/${product.body.products[0].id}`,
  );
  assert.equal(detail.body.environment, "staging");
  assert.equal(detail.body.test_data, true);

  // 6. Simulated adapters make no network calls, so real providers are unreachable.
  assertNoNetwork("src/payment/simulated-adapter.ts");
  assertNoNetwork("../backend/packages/api/src/modules/simulated-payment/service.ts");

  console.log("PASS: production-effect isolation holds and simulated adapters are network-free.");
  console.log("  production + simulated -> refused; local routing, no credentials");
  console.log("  providers: payment/otp/logistics = simulated; production_release_authorized=false");
} catch (error) {
  console.error("FAIL: isolation check failed.");
  console.error(error);
  process.exitCode = 1;
}
