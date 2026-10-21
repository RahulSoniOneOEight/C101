import assert from "node:assert/strict";
import { computeReturnEligibility, type OrderLineSnapshot } from "../returns/eligibility.js";
import type { ShipmentRecord } from "../logistics/shipment-store.js";

/**
 * Covers delivered/in-window, expired, over-quantity/already-requested and non-delivered branches
 * without a database or server.
 */

const now = Date.parse("2026-10-21T12:00:00.000Z");
const orderLines: OrderLineSnapshot[] = ["line_1", "line_2", "line_3", "line_4"].map(
  (lineKey) => ({
    line_key: lineKey,
    sku: `SKU-${lineKey}`,
    title: `Item ${lineKey}`,
    quantity: 3,
    unit_price: 1000,
    product_id: null,
    variant_id: null,
    seller_id: "seller_test",
  }),
);

const shipment = (
  id: string,
  lineKey: string,
  deliveredQty: number,
  deliveredAt: string | null,
): ShipmentRecord => ({
  id,
  orderGroupId: "og_test",
  allocationId: `alloc_${id}`,
  sellerId: "seller_test",
  provider: "simulated",
  trackingNumber: `SIM-${id}`,
  status: deliveredAt ? "delivered" : "in_transit",
  deliveredAt,
  proofRef: deliveredAt ? `staging://proof/${id}` : null,
  destinationPostcode: "302001",
  environment: "staging",
  logisticsMode: "simulated",
  testData: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  lines: [
    {
      lineKey,
      sku: `SKU-${lineKey}`,
      orderedQty: 3,
      deliveredQty,
    },
  ],
});

const eligibility = computeReturnEligibility({
  orderLines,
  shipments: [
    shipment("s1", "line_1", 2, "2026-10-20T12:00:00.000Z"),
    shipment("s2", "line_2", 3, "2026-09-20T12:00:00.000Z"),
    shipment("s3", "line_3", 1, "2026-10-20T12:00:00.000Z"),
  ],
  alreadyRequested: { line_3: 1 },
  now,
});

const byLine = new Map(eligibility.map((line) => [line.line_key, line]));
assert.equal(byLine.get("line_1")?.eligible, true);
assert.equal(byLine.get("line_1")?.returnable_qty, 2);
assert.equal(byLine.get("line_2")?.eligible, false);
assert.equal(byLine.get("line_2")?.ineligible_reason, "return_window_expired");
assert.equal(byLine.get("line_3")?.eligible, false);
assert.equal(byLine.get("line_3")?.ineligible_reason, "fully_returned");
assert.equal(byLine.get("line_4")?.eligible, false);
assert.equal(byLine.get("line_4")?.ineligible_reason, "not_delivered");
console.log("return-eligibility-test: pass");
