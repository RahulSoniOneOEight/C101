import { loadConfig } from "../config.js";

/**
 * E-017-013 expiry/late-payment evidence: an expired reservation cannot be committed, and its stock
 * is released so a late payment can re-reserve.
 */

const config = loadConfig(process.env);
const BASE = `http://localhost:${config.port}`;

const SKU = "EXPIRY-TEST-SKU";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function post(path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

async function main() {
  const runId = Date.now();

  await post("/v1/admin/tryton/variants", { sku: SKU, name: "Expiry Test SKU", price: 10000 });
  await post("/v1/admin/inventory/available", { sku: SKU, available: 1 });

  const a = await post(`/v1/checkouts/expiry-${runId}-a/reserve`, { sku: SKU, quantity: 1 });
  check("reserve A succeeds", a.status === 201, `status=${a.status}`);

  const expire = await post("/v1/admin/inventory/expire", { ttl_ms: 0 });
  check("expire releases the reservation", (expire.body?.expired as number) >= 1, `expired=${expire.body?.expired}`);

  const commitA = await post(`/v1/checkouts/expiry-${runId}-a/commit`);
  check("commit after expiry fails (reservation-expired)", commitA.status === 409, `status=${commitA.status}`);

  const b = await post(`/v1/checkouts/expiry-${runId}-b/reserve`, { sku: SKU, quantity: 1 });
  check("late payment re-reserves (checkout B)", b.status === 201, `status=${b.status}`);

  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll expiry checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
