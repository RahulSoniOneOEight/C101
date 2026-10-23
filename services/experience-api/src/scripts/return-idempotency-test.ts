import assert from "node:assert/strict";
import pg from "pg";
import { loadConfig } from "../config.js";
import { ReturnStore } from "../store/return-store.js";

/**
 * Proves return-request idempotency: same key + payload replays the same case; same key with a
 * different payload is a conflict.
 */

const config = loadConfig(process.env);
const store = new ReturnStore(config.experienceDatabaseUrl);
const pool = new pg.Pool({ connectionString: config.experienceDatabaseUrl });
const runId = Date.now().toString(36);
const userId = `pilot_idem_${runId}`;
const orderId = `checkout_idem_${runId}`;
const key = `idem_${runId}`;
const input = {
  orderId,
  userId,
  idempotencyKey: key,
  policyVersion: "return-policy-2026-10-20",
  policySnapshot: { policy_version: "return-policy-2026-10-20", window_days: 7 },
  resolution: "refund" as const,
  reasonCode: "damaged",
  lines: [
    {
      lineKey: "line_1",
      sku: "SKU-1",
      orderedQty: 2,
      deliveredQty: 2,
      requestedQty: 1,
      reasonCode: "damaged",
    },
  ],
};

const first = await store.request(input);
assert.equal(first.replayed, false);
const replay = await store.request(input);
assert.equal(replay.replayed, true);
assert.equal(replay.returnCase.id, first.returnCase.id);

let conflict = false;
try {
  await store.request({
    ...input,
    lines: [{ ...input.lines[0], requestedQty: 2 }],
  });
} catch (error) {
  conflict = (error as { code?: string }).code === "idempotency-key-reuse";
}
assert.equal(conflict, true);

await pool.query("DELETE FROM pilot_return_case WHERE id = $1", [first.returnCase.id]);
await pool.end();
await store.close();
console.log("return-idempotency-test: pass");
