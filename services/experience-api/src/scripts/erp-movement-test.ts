import assert from "node:assert/strict";
import { loadConfig } from "../config.js";
import { TrytonClient } from "../tryton/client.js";

/**
 * E-017-017 Tryton staging movement and accounting evidence.
 *
 * Proves the ERP executes real reservation commit/release as Tryton stock movements, that the
 * accounting projection uses staging test-clearing treatment, and that nothing posts to production
 * accounting or claims a bank receipt.
 */

const config = loadConfig(process.env);
const BASE = `http://localhost:${config.port}`;
const client = new TrytonClient(config);

const SKU = "ERP-MOVEMENT-TEST-SKU";
const runId = Date.now();

async function api(
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return (await r.json()) as T;
}

async function moveState(moveId: number): Promise<string> {
  const [row] = await client.read("stock.move", [moveId], ["state", "quantity"]);
  return String(row?.state ?? "");
}

try {
  await api("/v1/admin/tryton/variants", { sku: SKU, name: "ERP Movement Test SKU", price: 10000 });
  await api("/v1/admin/inventory/available", { sku: SKU, available: 10 });

  // Commit path: reserve -> draft move, commit -> allocated (assigned).
  const commitRef = `erp-${runId}-commit`;
  const reserve = await api(`/v1/checkouts/${commitRef}/reserve`, { sku: SKU, quantity: 1 });
  assert.equal(reserve.status, 201, "reserve should succeed");
  const moveId = reserve.body.tryton_move_id as number;
  assert.ok(moveId, "reserve must create a Tryton stock.move");
  assert.equal(await moveState(moveId), "draft", "new move should be draft");

  const commit = await api(`/v1/checkouts/${commitRef}/commit`);
  assert.equal(commit.status, 200, "commit should succeed");
  assert.equal(commit.body.status, "committed");
  assert.equal(await moveState(moveId), "assigned", "committed move should be assigned");

  // Release path: reserve -> release -> cancelled move.
  const releaseRef = `erp-${runId}-release`;
  const reserve2 = await api(`/v1/checkouts/${releaseRef}/reserve`, { sku: SKU, quantity: 1 });
  const moveId2 = reserve2.body.tryton_move_id as number;
  assert.ok(moveId2, "second reserve must create a move");
  const release = await api(`/v1/checkouts/${releaseRef}/release`);
  assert.equal(release.status, 200, "release should succeed");
  assert.equal(release.body.status, "released");
  assert.equal(await moveState(moveId2), "cancelled", "released move should be cancelled");

  // Accounting projection: staging test-clearing, no bank receipt, nothing posted to the ledger.
  const reconciliation = await apiGet<{
    accounting_treatment: string;
    bank_receipt_claimed: boolean;
    reconciled: boolean;
    reservation: { status: string };
    movement: { status: string };
    test_data: boolean;
  }>(`/v1/admin/orders/${commitRef}/reconciliation`);
  assert.equal(reconciliation.accounting_treatment, "staging_test_clearing");
  assert.equal(reconciliation.bank_receipt_claimed, false);
  assert.equal(reconciliation.reservation.status, "committed");
  assert.equal(reconciliation.movement.status, "staging-posted");
  assert.equal(reconciliation.test_data, true);

  const posted = await client.search("account.move", [], 5);
  assert.equal(posted.length, 0, "staging must not post any accounting entry");

  console.log("PASS: Tryton executes staging movements with test-clearing accounting.");
  console.log(`  commit move ${moveId}: draft -> assigned`);
  console.log(`  release move ${moveId2}: -> cancelled`);
  console.log("  accounting: staging_test_clearing, bank_receipt_claimed=false, posted account.move=0");
} catch (error) {
  console.error("FAIL: Tryton movement/accounting check failed.");
  console.error(error);
  process.exitCode = 1;
}
