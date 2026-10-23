import assert from "node:assert/strict";
import pg from "pg";
import { loadConfig } from "../config.js";
import { ShipmentStore } from "../logistics/shipment-store.js";
import { ReturnStore } from "../store/return-store.js";

/**
 * Database-backed manual workflow proof: optimistic versions, idempotent replay, partial delivery,
 * terminal delivery, return decisions and operational transitions. No Medusa or Tryton client is
 * involved, so a successful run also proves the workflow does not depend on money or stock APIs.
 */

const config = loadConfig(process.env);
const pool = new pg.Pool({ connectionString: config.experienceDatabaseUrl });
const shipments = new ShipmentStore(config.experienceDatabaseUrl);
const returns = new ReturnStore(config.experienceDatabaseUrl);
const runId = Date.now().toString(36);

const codeOf = async (operation: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await operation();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

const shipmentId = `ship_manual_${runId}`;
const orderGroupId = `og_manual_${runId}`;
const allocationId = `alloc_manual_${runId}`;

const booked = await shipments.book({
  orderGroupId,
  allocationId,
  sellerId: "seller_manual",
  lines: [
    { lineKey: "line_1", sku: "SKU-1", orderedQty: 2 },
    { lineKey: "line_2", sku: "SKU-2", orderedQty: 1 },
  ],
});
assert.equal(booked.created, true);
assert.equal(booked.shipment.version, 1);
assert.equal(booked.shipment.status, "booked");

const pickedUp = await shipments.transitionManual({
  shipmentId: booked.shipment.id,
  expectedVersion: 1,
  status: "picked_up",
  occurredAt: new Date().toISOString(),
  actorId: "operator_manual",
  actorRole: "marketplace_operator",
  source: "admin_console",
  idempotencyKey: `picked-up:${runId}`,
  reason: "Carrier collected the parcel",
});
assert.equal(pickedUp.duplicate, false);
assert.equal(pickedUp.statusChanged, true);
assert.equal(pickedUp.shipment.status, "picked_up");
assert.equal(pickedUp.shipment.version, 2);

const replay = await shipments.transitionManual({
  shipmentId: booked.shipment.id,
  expectedVersion: 1,
  status: "picked_up",
  occurredAt: new Date().toISOString(),
  actorId: "operator_manual",
  actorRole: "marketplace_operator",
  source: "admin_console",
  idempotencyKey: `picked-up:${runId}`,
  reason: "Carrier collected the parcel",
});
assert.equal(replay.duplicate, true);
assert.equal(replay.shipment.version, 2);

assert.equal(
  await codeOf(() =>
    shipments.transitionManual({
      shipmentId: booked.shipment.id,
      expectedVersion: 1,
      status: "in_transit",
      occurredAt: new Date().toISOString(),
      actorId: "operator_manual",
      actorRole: "marketplace_operator",
      source: "admin_console",
      idempotencyKey: `stale:${runId}`,
    }),
  ),
  "shipment-version-conflict",
);

const inTransit = await shipments.transitionManual({
  shipmentId: booked.shipment.id,
  expectedVersion: 2,
  status: "in_transit",
  occurredAt: new Date().toISOString(),
  actorId: "operator_manual",
  actorRole: "marketplace_operator",
  source: "admin_console",
  idempotencyKey: `in-transit:${runId}`,
});
assert.equal(inTransit.shipment.version, 3);

const outForDelivery = await shipments.transitionManual({
  shipmentId: booked.shipment.id,
  expectedVersion: 3,
  status: "out_for_delivery",
  occurredAt: new Date().toISOString(),
  actorId: "operator_manual",
  actorRole: "marketplace_operator",
  source: "admin_console",
  idempotencyKey: `ofd:${runId}`,
});
assert.equal(outForDelivery.shipment.version, 4);

const partial = await shipments.transitionManual({
  shipmentId: booked.shipment.id,
  expectedVersion: 4,
  status: "partially_delivered",
  occurredAt: new Date().toISOString(),
  actorId: "operator_manual",
  actorRole: "marketplace_operator",
  source: "admin_console",
  idempotencyKey: `partial:${runId}`,
  proofRef: "staging://proof/manual-partial",
  deliveredLines: [
    { lineKey: "line_1", deliveredQty: 1 },
    { lineKey: "line_2", deliveredQty: 0 },
  ],
});
assert.equal(partial.shipment.status, "partially_delivered");
assert.equal(partial.shipment.version, 5);
assert.equal(
  partial.shipment.lines.find((line) => line.lineKey === "line_1")?.deliveredQty,
  1,
);
assert.equal(partial.shipment.deliveredAt, null);

const completed = await shipments.transitionManual({
  shipmentId: booked.shipment.id,
  expectedVersion: 5,
  status: "delivered",
  occurredAt: new Date().toISOString(),
  actorId: "operator_manual",
  actorRole: "marketplace_operator",
  source: "admin_console",
  idempotencyKey: `delivered:${runId}`,
  proofRef: "staging://proof/manual-complete",
  deliveredLines: [
    { lineKey: "line_1", deliveredQty: 2 },
    { lineKey: "line_2", deliveredQty: 1 },
  ],
});
assert.equal(completed.shipment.status, "delivered");
assert.equal(completed.shipment.version, 6);
assert.ok(completed.shipment.deliveredAt);
assert.equal(completed.shipment.proofRef, "staging://proof/manual-complete");

const events = await shipments.listEvents(booked.shipment.id);
assert.equal(
  events.filter((event) => event.providerEventId.includes(`picked-up:${runId}`)).length,
  1,
);
assert.ok(events.some((event) => event.eventType === "admin_console.shipment.delivered"));

// A second shipment proves invalid delivery submissions do not mutate state.
const invalid = await shipments.book({
  orderGroupId: `${orderGroupId}_invalid`,
  allocationId: `${allocationId}_invalid`,
  sellerId: "seller_manual",
  lines: [
    { lineKey: "line_1", sku: "SKU-1", orderedQty: 2 },
    { lineKey: "line_2", sku: "SKU-2", orderedQty: 1 },
  ],
});
await shipments.transitionManual({
  shipmentId: invalid.shipment.id,
  expectedVersion: 1,
  status: "picked_up",
  occurredAt: new Date().toISOString(),
  actorId: "operator_manual",
  actorRole: "marketplace_operator",
  source: "admin_console",
  idempotencyKey: `invalid-pickup:${runId}`,
});
await shipments.transitionManual({
  shipmentId: invalid.shipment.id,
  expectedVersion: 2,
  status: "in_transit",
  occurredAt: new Date().toISOString(),
  actorId: "operator_manual",
  actorRole: "marketplace_operator",
  source: "admin_console",
  idempotencyKey: `invalid-transit:${runId}`,
});
await shipments.transitionManual({
  shipmentId: invalid.shipment.id,
  expectedVersion: 3,
  status: "out_for_delivery",
  occurredAt: new Date().toISOString(),
  actorId: "operator_manual",
  actorRole: "marketplace_operator",
  source: "admin_console",
  idempotencyKey: `invalid-ofd:${runId}`,
});

assert.equal(
  await codeOf(() =>
    shipments.transitionManual({
      shipmentId: invalid.shipment.id,
      expectedVersion: 4,
      status: "delivered",
      occurredAt: new Date().toISOString(),
      actorId: "operator_manual",
      actorRole: "marketplace_operator",
      source: "admin_console",
      idempotencyKey: `invalid-short:${runId}`,
      proofRef: "staging://proof/short",
      deliveredLines: [
        { lineKey: "line_1", deliveredQty: 1 },
        { lineKey: "line_2", deliveredQty: 0 },
      ],
    }),
  ),
  "partial-delivery-status-required",
);
const unchanged = await shipments.get(invalid.shipment.id);
assert.equal(unchanged?.status, "out_for_delivery");
assert.equal(unchanged?.version, 4);

assert.equal(
  await codeOf(() =>
    shipments.transitionManual({
      shipmentId: invalid.shipment.id,
      expectedVersion: 4,
      status: "partially_delivered",
      occurredAt: new Date().toISOString(),
      actorId: "operator_manual",
      actorRole: "marketplace_operator",
      source: "admin_console",
      idempotencyKey: `invalid-full:${runId}`,
      proofRef: "staging://proof/full",
      deliveredLines: [
        { lineKey: "line_1", deliveredQty: 2 },
        { lineKey: "line_2", deliveredQty: 1 },
      ],
    }),
  ),
  "invalid-partial-delivery",
);

// Return: Admin decision, operational stage, replay and stale-version protection.
const requested = await returns.request({
  orderId: `checkout_manual_${runId}`,
  orderGroupId,
  userId: `pilot_manual_${runId}`,
  idempotencyKey: `return-request:${runId}`,
  policyVersion: "return-policy-2026-10-20",
  policySnapshot: { policy_version: "return-policy-2026-10-20", window_days: 7 },
  resolution: "refund",
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
});
assert.equal(requested.returnCase.status, "requested");
assert.equal(requested.returnCase.version, 1);

const approved = await returns.decide({
  id: requested.returnCase.id,
  decision: "approved",
  actorId: "operator_manual",
  actorRole: "marketplace_operator",
  expectedVersion: 1,
  comment: "Approved after evidence review",
  approvedLines: [{ lineKey: "line_1", approvedQty: 1 }],
});
assert.equal(approved.status, "approved");
assert.equal(approved.version, 2);

const pickup = await returns.updateStatus({
  id: approved.id,
  status: "pickup_scheduled",
  expectedVersion: 2,
  idempotencyKey: `return-pickup:${runId}`,
  actorId: "operator_manual",
  actorRole: "marketplace_operator",
  note: "Reverse pickup scheduled",
});
assert.equal(pickup.duplicate, false);
assert.equal(pickup.returnCase.status, "pickup_scheduled");
assert.equal(pickup.returnCase.version, 3);

const pickupReplay = await returns.updateStatus({
  id: approved.id,
  status: "pickup_scheduled",
  expectedVersion: 2,
  idempotencyKey: `return-pickup:${runId}`,
  actorId: "operator_manual",
  actorRole: "marketplace_operator",
  note: "Reverse pickup scheduled",
});
assert.equal(pickupReplay.duplicate, true);
assert.equal(pickupReplay.returnCase.version, 3);

assert.equal(
  await codeOf(() =>
    returns.updateStatus({
      id: approved.id,
      status: "received",
      expectedVersion: 2,
      idempotencyKey: `return-stale:${runId}`,
      actorId: "operator_manual",
      actorRole: "marketplace_operator",
      note: "Stale retry",
    }),
  ),
  "return-version-conflict",
);

assert.equal(
  await codeOf(() =>
    returns.updateStatus({
      id: approved.id,
      status: "inspection_pending",
      expectedVersion: 3,
      idempotencyKey: `return-invalid:${runId}`,
      actorId: "operator_manual",
      actorRole: "marketplace_operator",
      note: "Invalid jump",
    }),
  ),
  "invalid-return-transition",
);

const received = await returns.updateStatus({
  id: approved.id,
  status: "received",
  expectedVersion: 3,
  idempotencyKey: `return-received:${runId}`,
  actorId: "seller_manual",
  actorRole: "seller",
  note: "Seller recorded receipt",
});
assert.equal(received.returnCase.status, "received");
assert.equal(received.returnCase.version, 4);

const returnEvents = await pool.query<{ detail: Record<string, unknown> }>(
  `SELECT detail FROM pilot_return_event
    WHERE return_case_id = $1 AND event_type = 'return.status_changed'`,
  [requested.returnCase.id],
);
assert.ok(returnEvents.rows.length >= 2);
for (const row of returnEvents.rows) {
  assert.equal(row.detail.money_effect, "none");
  assert.equal(row.detail.stock_effect, "none");
}

await pool.query("DELETE FROM pilot_return_case WHERE id = $1", [requested.returnCase.id]);
await pool.query("DELETE FROM pilot_shipment WHERE id = ANY($1::text[])", [
  [booked.shipment.id, invalid.shipment.id],
]);
await pool.end();
await shipments.close();
await returns.close();
console.log("manual-transition-db-test: pass");
