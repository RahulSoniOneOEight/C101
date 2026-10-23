import assert from "node:assert/strict";
import {
  SHIPMENT_STATUS_RANK,
  SHIPMENT_TRANSITIONS,
  SELLER_SHIPMENT_TRANSITIONS,
  allowedShipmentTransitions,
  assertDeliveredEvidence,
  sellerAllowedShipmentTransitions,
  validateDeliveryQuantities,
} from "../logistics/shipment-store.js";
import {
  RETURN_TRANSITIONS,
  SELLER_RETURN_TRANSITIONS,
  allowedReturnTransitions,
} from "../store/return-store.js";

/**
 * Pure contract checks for the manual order workflow. These run without a database so the
 * transition graph and partial-delivery rules cannot regress silently.
 */

const errorCode = (operation: () => unknown): string | undefined => {
  try {
    operation();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

// Shipment graph: forward-only except explicit retry loops and partial progress.
assert.ok(SHIPMENT_TRANSITIONS.delivered.length === 0);
assert.ok(SHIPMENT_TRANSITIONS.cancelled.length === 0);
assert.ok(SHIPMENT_TRANSITIONS.out_for_delivery.includes("partially_delivered"));
assert.ok(SHIPMENT_TRANSITIONS.out_for_delivery.includes("delivered"));
assert.ok(SHIPMENT_TRANSITIONS.partially_delivered.includes("partially_delivered"));
assert.ok(SHIPMENT_TRANSITIONS.partially_delivered.includes("delivered"));
assert.ok(!SHIPMENT_TRANSITIONS.booked.includes("delivered"));
assert.ok(SHIPMENT_STATUS_RANK.delayed > SHIPMENT_STATUS_RANK.in_transit);
assert.ok(
  SHIPMENT_STATUS_RANK.partially_delivered > SHIPMENT_STATUS_RANK.buyer_action_required,
);
assert.ok(SHIPMENT_STATUS_RANK.damaged > SHIPMENT_STATUS_RANK.partially_delivered);
assert.ok(SHIPMENT_STATUS_RANK.delivered > SHIPMENT_STATUS_RANK.damaged);
assert.deepEqual(allowedShipmentTransitions("booked"), [
  "ready_for_pickup",
  "picked_up",
  "cancelled",
]);

// Sellers may advance their own allocation but cannot cancel it.
assert.ok(SELLER_SHIPMENT_TRANSITIONS.has("delivered"));
assert.ok(SELLER_SHIPMENT_TRANSITIONS.has("partially_delivered"));
assert.ok(!SELLER_SHIPMENT_TRANSITIONS.has("cancelled"));
assert.deepEqual(sellerAllowedShipmentTransitions("booked"), [
  "ready_for_pickup",
  "picked_up",
]);

// Return decisions stay with Admin; sellers only advance reverse logistics.
assert.deepEqual(RETURN_TRANSITIONS.requested, ["under_review", "cancelled"]);
assert.ok(!RETURN_TRANSITIONS.requested.includes("approved"));
assert.ok(RETURN_TRANSITIONS.under_review.includes("approved"));
assert.ok(RETURN_TRANSITIONS.under_review.includes("rejected"));
assert.ok(RETURN_TRANSITIONS.approved.includes("pickup_scheduled"));
assert.ok(RETURN_TRANSITIONS.received.includes("inspection_pending"));
assert.ok(RETURN_TRANSITIONS.pickup_scheduled.includes("closed"));
assert.ok(RETURN_TRANSITIONS.pickup_attempted.includes("closed"));
assert.ok(RETURN_TRANSITIONS.in_return_transit.includes("closed"));
assert.ok(RETURN_TRANSITIONS.inspection_complete.includes("closed"));
assert.deepEqual(allowedReturnTransitions("closed"), []);
assert.ok(!SELLER_RETURN_TRANSITIONS.has("approved"));
assert.ok(!SELLER_RETURN_TRANSITIONS.has("rejected"));
assert.ok(!SELLER_RETURN_TRANSITIONS.has("cancelled"));

const lines = [
  { lineKey: "line_1", orderedQty: 2, deliveredQty: 0 },
  { lineKey: "line_2", orderedQty: 1, deliveredQty: 0 },
];

assert.equal(
  errorCode(() =>
    validateDeliveryQuantities({
      lines,
      deliveredLines: [
        { lineKey: "line_1", deliveredQty: 2 },
        { lineKey: "line_2", deliveredQty: 1 },
      ],
      target: "delivered",
    }),
  ),
  undefined,
);

assert.equal(
  errorCode(() =>
    validateDeliveryQuantities({
      lines,
      deliveredLines: [
        { lineKey: "line_1", deliveredQty: 1 },
        { lineKey: "line_2", deliveredQty: 0 },
      ],
      target: "partially_delivered",
    }),
  ),
  undefined,
);

assert.equal(
  errorCode(() =>
    validateDeliveryQuantities({
      lines,
      deliveredLines: [
        { lineKey: "line_1", deliveredQty: 1 },
        { lineKey: "line_2", deliveredQty: 0 },
      ],
      target: "delivered",
    }),
  ),
  "partial-delivery-status-required",
);

assert.equal(
  errorCode(() =>
    validateDeliveryQuantities({
      lines,
      deliveredLines: [
        { lineKey: "line_1", deliveredQty: 2 },
        { lineKey: "line_2", deliveredQty: 1 },
      ],
      target: "partially_delivered",
    }),
  ),
  "invalid-partial-delivery",
);

assert.equal(
  errorCode(() =>
    validateDeliveryQuantities({
      lines,
      deliveredLines: [{ lineKey: "line_1", deliveredQty: 1 }],
      target: "partially_delivered",
    }),
  ),
  "invalid-delivered-lines",
);

assert.equal(
  errorCode(() =>
    validateDeliveryQuantities({
      lines,
      deliveredLines: [{ lineKey: "line_1", deliveredQty: 0 }],
      target: "partially_delivered",
    }),
  ),
  "invalid-delivered-lines",
);

assert.equal(
  errorCode(() =>
    assertDeliveredEvidence(null, [{ lineKey: "line_1", deliveredQty: 1 }]),
  ),
  "delivery-evidence-required",
);
assert.equal(
  errorCode(() =>
    assertDeliveredEvidence("staging://proof", [{ lineKey: "", deliveredQty: 1 }]),
  ),
  "invalid-delivered-lines",
);
assert.equal(
  errorCode(() =>
    assertDeliveredEvidence("staging://proof", [
      { lineKey: "line_1", deliveredQty: 1 },
      { lineKey: "line_1", deliveredQty: 1 },
    ]),
  ),
  "invalid-delivered-lines",
);
assert.equal(
  errorCode(() =>
    assertDeliveredEvidence("staging://proof", [{ lineKey: "line_1", deliveredQty: 1 }]),
  ),
  undefined,
);

console.log("manual-transition-test: pass");
