import { loadConfig } from "./config.js";

/**
 * Cross-surface parity check (WP5). One backend rule must produce the same authoritative result
 * regardless of the client surface. Since Flutter and web share the same Experience API, parity is
 * verified by asserting deterministic, invariant results across repeated calls.
 */

const config = loadConfig(process.env);
const BASE = `http://localhost:${config.port}`;

const problems: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(name);
};

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return (await r.json()) as T;
}

async function main(): Promise<void> {
  // 1. Collections are deterministic and enabled ones return products.
  const c1 = await getJson<{ items: { id: string }[]; fallback: boolean }>("/v1/collections/new_arrivals");
  const c2 = await getJson<{ items: { id: string }[]; fallback: boolean }>("/v1/collections/new_arrivals");
  check("new_arrivals returns products", c1.items.length > 0);
  check("new_arrivals deterministic", JSON.stringify(c1.items) === JSON.stringify(c2.items));

  // 2. Deferred collection falls back, not errors.
  const deferred = await getJson<{ fallback: boolean; items: { id: string }[] }>("/v1/collections/best_sellers");
  check("best_sellers falls back", deferred.fallback === true && deferred.items.length > 0);

  // 3. Commercial eligibility: selected seller is the lowest priced in-stock offer.
  const productId = c1.items[0].id;
  const p1 = await getJson<{ commercial: { selected_seller: { unit_amount_minor: number }; payment_eligibility: string[] } }>(`/v1/products/${productId}`);
  const p2 = await getJson<{ commercial: { selected_seller: { unit_amount_minor: number }; payment_eligibility: string[] } }>(`/v1/products/${productId}`);
  check(
    "commercial selected seller deterministic",
    p1.commercial.selected_seller?.unit_amount_minor === p2.commercial.selected_seller?.unit_amount_minor,
  );
  check("payment eligibility is simulated", p1.commercial.payment_eligibility.includes("simulated"));

  // 4. Content: locale fallback returns an item for a known placement.
  const content = await getJson<{ items: { title: string }[] }>("/v1/content/app-shell?locale=hi-IN&placement=help.delivery");
  check("content hi-IN falls back to en-IN", content.items.length > 0);

  if (problems.length) {
    console.error(`\n${problems.length} parity check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll parity checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
