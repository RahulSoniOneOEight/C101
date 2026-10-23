import assert from "node:assert/strict";
import pg from "pg";
import { loadConfig } from "../config.js";
import { ShipmentStore } from "../logistics/shipment-store.js";

/**
 * Proves provider-event dedupe and monotonic ordering: a replay creates no second row, and an
 * out-of-order in_transit after delivered cannot move the persisted status backwards.
 */

const config = loadConfig(process.env);
const store = new ShipmentStore(config.experienceDatabaseUrl);
const runId = Date.now().toString(36);
const allocationId = `alloc_order_${runId}`;
const orderGroupId = `og_order_${runId}`;

const booked = await store.book({
  orderGroupId,
  allocationId,
  sellerId: "seller_test",
  lines: [{ lineKey: "line_1", sku: "SKU-1", orderedQty: 2 }],
});
assert.equal(booked.created, true);
const shipmentId = booked.shipment.id;

const inTransitId = `evt_transit_${runId}`;
await store.appendEvent({
  shipmentId,
  providerEventId: inTransitId,
  eventType: "shipment.in_transit",
  status: "in_transit",
  occurredAt: new Date(Date.now() - 2000).toISOString(),
});
await store.appendEvent({
  shipmentId,
  providerEventId: `evt_delivered_${runId}`,
  eventType: "shipment.delivered",
  status: "delivered",
  occurredAt: new Date().toISOString(),
  deliveredLines: [{ lineKey: "line_1", deliveredQty: 2 }],
  proofRef: "staging://proof/order",
});

const replay = await store.appendEvent({
  shipmentId,
  providerEventId: `evt_delivered_${runId}`,
  eventType: "shipment.delivered",
  status: "delivered",
  occurredAt: new Date().toISOString(),
  deliveredLines: [{ lineKey: "line_1", deliveredQty: 2 }],
  proofRef: "staging://proof/order",
});
assert.equal(replay.duplicate, true);
assert.equal(replay.statusChanged, false);

const outOfOrder = await store.appendEvent({
  shipmentId,
  providerEventId: `evt_late_transit_${runId}`,
  eventType: "shipment.in_transit",
  status: "in_transit",
  occurredAt: new Date(Date.now() - 60_000).toISOString(),
});
assert.equal(outOfOrder.statusChanged, false);

const current = await store.get(shipmentId);
assert.equal(current?.status, "delivered");
assert.equal(current?.lines[0].deliveredQty, 2);
assert.equal(current?.proofRef, "staging://proof/order");
const events = await store.listEvents(shipmentId);
assert.equal(events.filter((event) => event.providerEventId === `evt_delivered_${runId}`).length, 1);
assert.ok(events.length >= 4);

const pool = new pg.Pool({ connectionString: config.experienceDatabaseUrl });
await pool.query("DELETE FROM pilot_shipment WHERE id = $1", [shipmentId]);
await pool.end();
await store.close();
console.log("shipment-event-ordering-test: pass");
