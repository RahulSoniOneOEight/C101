import { loadConfig } from "../config.js";

/**
 * E-017-013 concurrency evidence: concurrent reservations against constrained stock must not oversell.
 * Sets a test SKU to `available = 5`, fires 10 concurrent reserve requests, and asserts exactly 5
 * succeed while 5 are rejected with 409 insufficient-stock.
 */

const config = loadConfig(process.env);
const BASE = `http://localhost:${config.port}`;

const SKU = "CONCURRENCY-TEST-SKU";
const AVAILABLE = 5;
const ATTEMPTS = 10;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

async function getLedger() {
  const r = await fetch(`${BASE}/v1/admin/inventory/${SKU}`);
  return (await r.json()) as { reserved: number; available: number };
}

async function main() {
  // Sync the test SKU to Tryton so the ERP move can be created (reserve also creates a stock.move).
  const sync = await post("/v1/admin/tryton/variants", {
    sku: SKU,
    name: "Concurrency Test SKU",
    price: 10000,
  });
  if (sync.status !== 201) {
    console.error(`Failed to sync test SKU to Tryton: ${sync.status}`);
    process.exit(1);
  }

  await post("/v1/admin/inventory/available", { sku: SKU, available: AVAILABLE });

  const runId = Date.now();
  const results = await Promise.all(
    Array.from({ length: ATTEMPTS }, (_, i) =>
      post(`/v1/checkouts/concurrency-${runId}-${i}/reserve`, { sku: SKU, quantity: 1 }),
    ),
  );

  const reserved = results.filter((r) => r.status === 201);
  const rejected = results.filter((r) => r.status === 409);
  const other = results.filter((r) => r.status !== 201 && r.status !== 409);

  check(
    "exactly AVAILABLE reservations succeeded",
    reserved.length === AVAILABLE,
    `${reserved.length}/${AVAILABLE}`,
  );
  check(
    "exactly (ATTEMPTS - AVAILABLE) rejected as insufficient-stock",
    rejected.length === ATTEMPTS - AVAILABLE,
    `${rejected.length}/${ATTEMPTS - AVAILABLE}`,
  );
  check("no unexpected statuses", other.length === 0, JSON.stringify(other.map((r) => r.status)));
  for (const o of other) {
    console.log(`  [debug] status=${o.status} detail=${o.body?.detail ?? JSON.stringify(o.body)}`);
  }

  const ledger = await getLedger();
  check(
    "ledger reserved does not exceed available",
    ledger.reserved <= ledger.available,
    `reserved=${ledger.reserved} available=${ledger.available}`,
  );
  check("ledger reserved equals AVAILABLE", ledger.reserved === AVAILABLE, `reserved=${ledger.reserved}`);

  const successCheckout = reserved[0]?.body?.checkout_id as string | undefined;
  if (successCheckout) {
    const again = await post(`/v1/checkouts/${successCheckout}/reserve`, { sku: SKU, quantity: 1 });
    check(
      "re-reserve is idempotent (returns existing reservation)",
      (again.status === 200 || again.status === 201) && again.body?.idempotent === true,
      `status=${again.status}`,
    );
    const after = await getLedger();
    check("idempotent re-reserve did not double-count", after.reserved === AVAILABLE, `reserved=${after.reserved}`);
  }

  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll concurrency checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
