import assert from "node:assert/strict";
import pg from "pg";
import { loadConfig } from "../config.js";
import { ShipmentStore } from "../logistics/shipment-store.js";

/**
 * Proves a shipment is durable across a new store/service instance, not held in an in-memory Map.
 */

const config = loadConfig(process.env);
const runId = Date.now().toString(36);
const first = new ShipmentStore(config.experienceDatabaseUrl);
const booked = await first.book({
  orderGroupId: `og_restart_${runId}`,
  allocationId: `alloc_restart_${runId}`,
  sellerId: "seller_restart",
  lines: [{ lineKey: "line_restart", sku: "SKU-RESTART", orderedQty: 1 }],
});
await first.close();

const second = new ShipmentStore(config.experienceDatabaseUrl);
const reloaded = await second.get(booked.shipment.id);
assert.ok(reloaded);
assert.equal(reloaded?.allocationId, `alloc_restart_${runId}`);
assert.equal(reloaded?.lines[0].sku, "SKU-RESTART");
await second.close();

const pool = new pg.Pool({ connectionString: config.experienceDatabaseUrl });
await pool.query("DELETE FROM pilot_shipment WHERE id = $1", [booked.shipment.id]);
await pool.end();
console.log("shipment-restart-test: pass");
