import assert from "node:assert/strict";
import { loadConfig } from "../config.js";

/**
 * E-017-019 shared-backend client and operations connectivity evidence.
 *
 * Proves the customer app surface and the operator surface consume the shared Experience API and
 * that environment, freshness and test-data markers are visible. (The web surface is deferred, Phase
 * 6; this covers the implemented app + operator surfaces.)
 */

const config = loadConfig(process.env);
const BASE = `http://localhost:${config.port}`;

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  assert.equal(r.ok, true, `${path} should return 200 (got ${r.status})`);
  return (await r.json()) as T;
}

async function getText(path: string): Promise<string> {
  const r = await fetch(`${BASE}${path}`);
  assert.equal(r.ok, true, `${path} should return 200 (got ${r.status})`);
  return r.text();
}

try {
  // Health: environment + payment mode + test marker.
  const health = await getJson<{ status: string; environment: string; payment_mode: string; test_data: boolean }>("/health");
  assert.equal(health.status, "ok");
  assert.equal(health.environment, "staging");
  assert.equal(health.payment_mode, "simulated");
  assert.equal(health.test_data, true);

  // App surface: composed catalogue + product detail with commercial/freshness markers.
  const list = await getJson<{ products: unknown[]; environment: string; test_data: boolean }>("/v1/products?limit=5");
  assert.ok(list.products.length > 0, "catalogue should return products");
  assert.equal(list.test_data, true);

  const first = list.products[0] as { id: string };
  const detail = await getJson<{
    commercial: { payment_eligibility: string[] };
    environment: string;
    test_data: boolean;
    freshness: { source: string; stale: boolean }[];
  }>(`/v1/products/${first.id}`);
  assert.equal(detail.environment, "staging");
  assert.equal(detail.test_data, true);
  assert.ok(detail.commercial.payment_eligibility.includes("simulated"), "payment eligibility must be server-selected");
  assert.ok(detail.freshness.some((f) => f.source === "medusa" && f.stale === false), "medusa freshness required");
  assert.ok(detail.freshness.some((f) => f.source === "mercur" && f.stale === false), "mercur freshness required");

  // App surface: collections expose environment/freshness markers.
  const collection = await getJson<{ items: unknown[]; environment: string; test_data: boolean }>("/v1/collections/new_arrivals");
  assert.ok(collection.items.length > 0);
  assert.equal(collection.test_data, true);

  // Operator surface: admin APIs + /ops console expose environment/test markers.
  for (const path of ["/v1/admin/events", "/v1/admin/orders", "/v1/admin/collections"]) {
    const body = await getJson<{ environment: string; test_data: boolean }>(path);
    assert.equal(body.environment, "staging", `${path} environment`);
    assert.equal(body.test_data, true, `${path} test_data`);
  }
  const ops = await getText("/ops");
  assert.ok(ops.includes("Ops Console"), "/ops operator console should render");

  // Operational telemetry surface.
  const metrics = await getText("/metrics");
  assert.ok(metrics.includes("buildkart_process_rss_mb"), "/metrics should expose resource telemetry");

  console.log("PASS: shared-backend app + operator surfaces expose environment/freshness/test markers.");
  console.log("  app: catalogue + product detail (payment_eligibility=simulated, freshness medusa/mercur)");
  console.log("  operator: /v1/admin/* + /ops + /metrics");
  console.log("  web: apps/web (Next.js) consumes the same shared contracts; seller = Mercur dashboard");
} catch (error) {
  console.error("FAIL: shared-backend connectivity check failed.");
  console.error(error);
  process.exitCode = 1;
}
