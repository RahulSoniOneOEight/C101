import assert from "node:assert/strict";
import pg from "pg";
import { loadConfig } from "../config.js";
import { ShipmentStore } from "../logistics/shipment-store.js";
import { CorrelationStore } from "../store/correlation-store.js";
import { ReturnStore } from "../store/return-store.js";

/**
 * HTTP-level manual workflow proof. Uses the running Experience API with the staging service
 * credential, exercises Admin and Seller routes, and proves Seller scoping and transition limits.
 */

const config = loadConfig(process.env);
const base = process.env.EXPERIENCE_BASE_URL ?? "http://localhost:9020";
const secret =
  process.env.BUILDKART_ADMIN_SERVICE_SECRET ??
  "buildkart-staging-dummy-admin-service-secret";
const runId = Date.now().toString(36);
const sellerA = `seller_http_a_${runId}`;
const sellerB = `seller_http_b_${runId}`;
const orderGroupId = `og_http_${runId}`;
const checkoutRef = `checkout_http_${runId}`;
const shipmentStore = new ShipmentStore(config.experienceDatabaseUrl);
const returnStore = new ReturnStore(config.experienceDatabaseUrl);
const correlation = new CorrelationStore(config.experienceDatabaseUrl);
const pool = new pg.Pool({ connectionString: config.experienceDatabaseUrl });

const adminHeaders = {
  "content-type": "application/json",
  "x-buildkart-admin-service-secret": secret,
  "x-operator-user-id": "manual-http-test",
};
const sellerHeaders = (sellerId: string) => ({
  ...adminHeaders,
  "x-buildkart-seller-id": sellerId,
});
const post = (path: string, body: unknown, headers: Record<string, string>) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
const get = (path: string, headers: Record<string, string>) =>
  fetch(`${base}${path}`, { headers });

const booked = await shipmentStore.book({
  orderGroupId,
  allocationId: `alloc_http_${runId}`,
  sellerId: sellerA,
  lines: [{ lineKey: "line_1", sku: "SKU-HTTP", orderedQty: 2 }],
});
await correlation.link(checkoutRef, { orderGroup: orderGroupId, ownerUserId: `pilot_http_${runId}` });

const adminUpdate = await post(
  `/v1/admin/shipments/${booked.shipment.id}/status`,
  {
    status: "picked_up",
    expected_version: 1,
    operation_key: `http-admin-pickup:${runId}`,
    reason: "Admin recorded carrier pickup",
  },
  adminHeaders,
);
assert.equal(adminUpdate.status, 201);
const adminUpdateBody = (await adminUpdate.json()) as {
  shipment: { status: string; version: number; allowedTransitions: string[] };
};
assert.equal(adminUpdateBody.shipment.status, "picked_up");
assert.equal(adminUpdateBody.shipment.version, 2);
assert.ok(adminUpdateBody.shipment.allowedTransitions.includes("in_transit"));
assert.ok(adminUpdateBody.shipment.allowedTransitions.includes("returning_to_seller"));

const sellerDetail = await get(
  `/v1/seller/shipments/${booked.shipment.id}`,
  sellerHeaders(sellerA),
);
assert.equal(sellerDetail.status, 200);
const sellerDetailBody = (await sellerDetail.json()) as {
  shipment: { allowedTransitions: string[] };
};
assert.ok(!sellerDetailBody.shipment.allowedTransitions.includes("cancelled"));

const crossDetail = await get(
  `/v1/seller/shipments/${booked.shipment.id}`,
  sellerHeaders(sellerB),
);
assert.equal(crossDetail.status, 404);

const sellerLifecycle = await get(
  `/v1/seller/order-groups/${orderGroupId}/delivery-returns`,
  sellerHeaders(sellerA),
);
assert.equal(sellerLifecycle.status, 200);
const sellerLifecycleBody = (await sellerLifecycle.json()) as {
  seller_id: string;
  shipments: Array<{ id: string }>;
  returns: unknown[];
};
assert.equal(sellerLifecycleBody.seller_id, sellerA);
assert.equal(sellerLifecycleBody.shipments.length, 1);
assert.equal(sellerLifecycleBody.returns.length, 0);

const crossLifecycle = await get(
  `/v1/seller/order-groups/${orderGroupId}/delivery-returns`,
  sellerHeaders(sellerB),
);
assert.equal(crossLifecycle.status, 404);

const sellerUpdate = await post(
  `/v1/seller/shipments/${booked.shipment.id}/status`,
  {
    status: "in_transit",
    expected_version: 2,
    operation_key: `http-seller-transit:${runId}`,
    note: "Seller handed over to the carrier",
  },
  sellerHeaders(sellerA),
);
assert.equal(sellerUpdate.status, 201);

const sellerCancel = await post(
  `/v1/seller/shipments/${booked.shipment.id}/status`,
  {
    status: "cancelled",
    expected_version: 3,
    operation_key: `http-seller-cancel:${runId}`,
    reason: "Seller attempted cancellation",
  },
  sellerHeaders(sellerA),
);
assert.equal(sellerCancel.status, 403);

const requested = await returnStore.request({
  orderId: checkoutRef,
  orderGroupId,
  userId: `pilot_http_${runId}`,
  idempotencyKey: `http-return:${runId}`,
  policyVersion: "return-policy-2026-10-20",
  policySnapshot: { policy_version: "return-policy-2026-10-20", window_days: 7 },
  resolution: "refund",
  reasonCode: "damaged",
  lines: [
    {
      lineKey: "line_1",
      sku: "SKU-HTTP",
      orderedQty: 2,
      deliveredQty: 2,
      requestedQty: 1,
      reasonCode: "damaged",
    },
  ],
});

const approved = await post(
  `/v1/admin/returns/${requested.returnCase.id}/approve`,
  {
    expected_version: 1,
    comment: "Approved over HTTP",
    approved_lines: [{ line_key: "line_1", approved_qty: 1 }],
  },
  adminHeaders,
);
assert.equal(approved.status, 200);
const approvedBody = (await approved.json()) as {
  return: { status: string; version: number };
};
assert.equal(approvedBody.return.status, "approved");
assert.equal(approvedBody.return.version, 2);

const duplicateApprove = await post(
  `/v1/admin/returns/${requested.returnCase.id}/approve`,
  { expected_version: 1, comment: "Duplicate decision" },
  adminHeaders,
);
assert.equal(duplicateApprove.status, 409);

const sellerReturn = await get(
  `/v1/seller/returns/${requested.returnCase.id}`,
  sellerHeaders(sellerA),
);
assert.equal(sellerReturn.status, 200);
const sellerReturnBody = (await sellerReturn.json()) as {
  return: { status: string; allowedTransitions: string[] };
};
assert.equal(sellerReturnBody.return.status, "approved");
assert.ok(!sellerReturnBody.return.allowedTransitions.includes("cancelled"));
assert.ok(!sellerReturnBody.return.allowedTransitions.includes("approved"));

const crossReturn = await get(
  `/v1/seller/returns/${requested.returnCase.id}`,
  sellerHeaders(sellerB),
);
assert.equal(crossReturn.status, 404);

const pickup = await post(
  `/v1/seller/returns/${requested.returnCase.id}/status`,
  {
    status: "pickup_scheduled",
    expected_version: 2,
    operation_key: `http-return-pickup:${runId}`,
    note: "Seller scheduled reverse pickup",
  },
  sellerHeaders(sellerA),
);
assert.equal(pickup.status, 200);

const sellerReturnCancel = await post(
  `/v1/seller/returns/${requested.returnCase.id}/status`,
  {
    status: "cancelled",
    expected_version: 3,
    operation_key: `http-return-cancel:${runId}`,
    note: "Seller attempted cancellation",
  },
  sellerHeaders(sellerA),
);
assert.equal(sellerReturnCancel.status, 409);

const received = await post(
  `/v1/admin/returns/${requested.returnCase.id}/status`,
  {
    status: "received",
    expected_version: 3,
    operation_key: `http-return-received:${runId}`,
    note: "Admin recorded receipt",
  },
  adminHeaders,
);
assert.equal(received.status, 200);

const adminDecisionViaStatus = await post(
  `/v1/admin/returns/${requested.returnCase.id}/status`,
  {
    status: "approved",
    expected_version: 4,
    operation_key: `http-return-reopen:${runId}`,
    note: "Invalid decision through status route",
  },
  adminHeaders,
);
assert.equal(adminDecisionViaStatus.status, 409);

const adminShipment = await get(
  `/v1/admin/shipments/${booked.shipment.id}`,
  adminHeaders,
);
assert.equal(adminShipment.status, 200);
const adminShipmentBody = (await adminShipment.json()) as {
  shipment: { version: number; allowedTransitions: string[] };
  events: Array<{ provider: string }>;
};
assert.equal(adminShipmentBody.shipment.version, 3);
assert.ok(adminShipmentBody.events.some((event) => event.provider === "manual"));

const effectRows = await pool.query<{ detail: Record<string, unknown> }>(
  `SELECT detail FROM pilot_return_event
    WHERE return_case_id = $1 AND event_type = 'return.status_changed'`,
  [requested.returnCase.id],
);
assert.ok(effectRows.rows.length >= 1);
for (const row of effectRows.rows) {
  assert.equal(row.detail.money_effect, "none");
  assert.equal(row.detail.stock_effect, "none");
}

await pool.query("DELETE FROM pilot_return_case WHERE id = $1", [requested.returnCase.id]);
await pool.query("DELETE FROM pilot_shipment WHERE id = $1", [booked.shipment.id]);
await pool.query("DELETE FROM correlation WHERE checkout_ref = $1", [checkoutRef]);
await pool.end();
await shipmentStore.close();
await returnStore.close();
await correlation.close();
console.log("manual-transition-http-test: pass");
