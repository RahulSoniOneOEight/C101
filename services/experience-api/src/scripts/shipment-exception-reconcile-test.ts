import assert from "node:assert/strict";
import pg from "pg";
import { loadConfig } from "../config.js";
import { ShipmentStore } from "../logistics/shipment-store.js";

/**
 * Proves exception projection and reconcile repair. The persisted status is deliberately corrupted
 * below the derived event rank; reconcile restores it and reports the difference.
 */

const config = loadConfig(process.env);
const store = new ShipmentStore(config.experienceDatabaseUrl);
const pool = new pg.Pool({ connectionString: config.experienceDatabaseUrl });
const runId = Date.now().toString(36);
const booked = await store.book({
  orderGroupId: `og_exc_${runId}`,
  allocationId: `alloc_exc_${runId}`,
  sellerId: "seller_exc",
  lines: [{ lineKey: "line_exc", sku: "SKU-EXC", orderedQty: 1 }],
});
await store.appendEvent({
  shipmentId: booked.shipment.id,
  providerEventId: `evt_damaged_${runId}`,
  eventType: "shipment.damaged",
  status: "damaged",
  occurredAt: new Date().toISOString(),
  payload: { simulated: true, scenario: "damaged" },
});
const exceptions = await store.listExceptions(500);
assert.ok(exceptions.some((shipment) => shipment.id === booked.shipment.id));

await pool.query("UPDATE pilot_shipment SET status = 'booked' WHERE id = $1", [
  booked.shipment.id,
]);
const diff = await store.reconcile(booked.shipment.id);
assert.equal(diff?.persistedStatus, "booked");
assert.equal(diff?.derivedStatus, "damaged");
assert.equal(diff?.statusAdjusted, true);
assert.equal(diff?.repaired, true);

const repaired = await store.get(booked.shipment.id);
assert.equal(repaired?.status, "damaged");

await pool.query("DELETE FROM pilot_shipment WHERE id = $1", [booked.shipment.id]);
await pool.end();
await store.close();
console.log("shipment-exception-reconcile-test: pass");
