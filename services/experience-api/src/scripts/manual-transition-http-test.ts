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
const ownerUserId = process.env.MANUAL_OWNER_USER_ID ?? "pilot_01";
const ownerIdentifier = process.env.MANUAL_OWNER_IDENTIFIER ?? "pilot1@buildkart.test";
const otherIdentifier = process.env.MANUAL_OTHER_IDENTIFIER ?? "pilot2@buildkart.test";
const orderGroupId = `og_http_${runId}`;
const checkoutRef = `checkout_http_${runId}`;
const testCorrelationId = `manual-http:${runId}`;
const shipmentStore = new ShipmentStore(config.experienceDatabaseUrl);
const returnStore = new ReturnStore(config.experienceDatabaseUrl);
const correlation = new CorrelationStore(config.experienceDatabaseUrl);
const pool = new pg.Pool({ connectionString: config.experienceDatabaseUrl });

const adminHeaders = {
  "content-type": "application/json",
  "x-buildkart-admin-service-secret": secret,
  "x-operator-user-id": "manual-http-test",
  "x-correlation-id": testCorrelationId,
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
const publicHeaders = {
  "content-type": "application/json",
  "x-correlation-id": testCorrelationId,
};

const customerSession = async (identifier: string): Promise<string> => {
  const challengeResponse = await post(
    "/v1/auth/otp/challenges",
    { identifier },
    publicHeaders,
  );
  assert.equal(challengeResponse.status, 201);
  const challenge = (await challengeResponse.json()) as { challenge_id: string };
  const verifyResponse = await post(
    "/v1/auth/otp/verify",
    { challenge_id: challenge.challenge_id, code: config.pilotOtpCode },
    publicHeaders,
  );
  assert.equal(verifyResponse.status, 200);
  const verified = (await verifyResponse.json()) as { session_token: string };
  assert.ok(verified.session_token);
  return verified.session_token;
};

const bearerHeaders = (token: string) => ({
  authorization: `Bearer ${token}`,
  "x-correlation-id": testCorrelationId,
});

const returnMutationCounts = async (returnId: string) => {
  const [returnCase, lines, internalEvents, domainEvents, simulations] = await Promise.all([
    pool.query<{ status: string; version: number }>(
      `SELECT status, version FROM pilot_return_case WHERE id = $1`,
      [returnId],
    ),
    pool.query<{
      line_key: string;
      received_qty: number | null;
      condition: string | null;
      disposition: string | null;
    }>(
      `SELECT line_key, received_qty, condition, disposition
         FROM pilot_return_line WHERE return_case_id = $1 ORDER BY line_key`,
      [returnId],
    ),
    pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM pilot_return_event WHERE return_case_id = $1`,
      [returnId],
    ),
    pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM domain_event
        WHERE aggregate_type = 'return' AND aggregate_id = $1`,
      [returnId],
    ),
    pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM pilot_return_refund_simulation
        WHERE return_case_id = $1`,
      [returnId],
    ),
  ]);
  return {
    returnCase: returnCase.rows[0],
    lines: lines.rows,
    internalEventCount: Number(internalEvents.rows[0]?.count ?? 0),
    domainEventCount: Number(domainEvents.rows[0]?.count ?? 0),
    simulationCount: Number(simulations.rows[0]?.count ?? 0),
  };
};

const booked = await shipmentStore.book({
  orderGroupId,
  allocationId: `alloc_http_${runId}`,
  sellerId: sellerA,
  lines: [{ lineKey: "line_1", sku: "SKU-HTTP", orderedQty: 2 }],
});
await correlation.link(checkoutRef, { orderGroup: orderGroupId, ownerUserId });

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
  userId: ownerUserId,
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

const ownerToken = await customerSession(ownerIdentifier);
const otherToken = await customerSession(otherIdentifier);

const unauthenticatedAdmin = await get(
  `/v1/admin/returns/${requested.returnCase.id}`,
  {},
);
assert.equal(unauthenticatedAdmin.status, 401);
const unauthenticatedSeller = await get(
  `/v1/seller/returns/${requested.returnCase.id}`,
  {},
);
assert.equal(unauthenticatedSeller.status, 401);
const unauthenticatedCustomer = await get(
  `/v1/returns/${requested.returnCase.id}`,
  {},
);
assert.equal(unauthenticatedCustomer.status, 401);

const ownerOrder = await get(`/v1/orders/${checkoutRef}`, bearerHeaders(ownerToken));
assert.equal(ownerOrder.status, 200);
const otherOrder = await get(`/v1/orders/${checkoutRef}`, bearerHeaders(otherToken));
assert.equal(otherOrder.status, 404);
const ownerOrders = await get("/v1/me/orders", bearerHeaders(ownerToken));
assert.equal(ownerOrders.status, 200);
const ownerOrdersBody = (await ownerOrders.json()) as { items: Array<{ order_id: string }> };
assert.ok(ownerOrdersBody.items.some((item) => item.order_id === checkoutRef));
const otherOrders = await get("/v1/me/orders", bearerHeaders(otherToken));
assert.equal(otherOrders.status, 200);
const otherOrdersBody = (await otherOrders.json()) as { items: Array<{ order_id: string }> };
assert.ok(!otherOrdersBody.items.some((item) => item.order_id === checkoutRef));
const ownerReturn = await get(
  `/v1/returns/${requested.returnCase.id}`,
  bearerHeaders(ownerToken),
);
assert.equal(ownerReturn.status, 200);
const otherReturn = await get(
  `/v1/returns/${requested.returnCase.id}`,
  bearerHeaders(otherToken),
);
assert.equal(otherReturn.status, 404);

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

const beforeSellerAuthorityAttempts = await returnMutationCounts(requested.returnCase.id);
const sellerApproveAttempt = await post(
  `/v1/admin/returns/${requested.returnCase.id}/approve`,
  {
    expected_version: 2,
    comment: "Seller attempted an Admin decision",
    approved_lines: [{ line_key: "line_1", approved_qty: 1 }],
  },
  sellerHeaders(sellerA),
);
assert.equal(sellerApproveAttempt.status, 403);
const sellerRejectAttempt = await post(
  `/v1/admin/returns/${requested.returnCase.id}/reject`,
  { expected_version: 2, comment: "Seller attempted rejection" },
  sellerHeaders(sellerA),
);
assert.equal(sellerRejectAttempt.status, 403);
const sellerAdminRefundAttempt = await post(
  `/v1/admin/returns/${requested.returnCase.id}/refund-simulation`,
  {
    expected_version: 2,
    operation_key: `seller-refund-attempt:${runId}`,
    amount_minor: 1000,
    currency_code: "INR",
    method: "original_method_simulation",
    breakdown: {
      item_subtotal_minor: 1000,
      tax_minor: 0,
      shipping_minor: 0,
      restocking_fee_minor: 0,
      return_freight_minor: 0,
    },
  },
  sellerHeaders(sellerA),
);
assert.equal(sellerAdminRefundAttempt.status, 403);
const sellerRefundRouteAttempt = await post(
  `/v1/seller/returns/${requested.returnCase.id}/refund-simulation`,
  { expected_version: 2 },
  sellerHeaders(sellerA),
);
assert.equal(sellerRefundRouteAttempt.status, 404);
assert.deepEqual(
  await returnMutationCounts(requested.returnCase.id),
  beforeSellerAuthorityAttempts,
);

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
  return: {
    status: string;
    allowedTransitions: string[];
    refundSimulation: null;
  };
};
assert.equal(sellerReturnBody.return.status, "approved");
assert.ok(!sellerReturnBody.return.allowedTransitions.includes("cancelled"));
assert.ok(!sellerReturnBody.return.allowedTransitions.includes("approved"));
assert.ok(!sellerReturnBody.return.allowedTransitions.includes("inspection_complete"));
assert.ok(!sellerReturnBody.return.allowedTransitions.includes("closed"));
assert.equal(sellerReturnBody.return.refundSimulation, null);

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

const beforeInspectionDenials = await returnMutationCounts(requested.returnCase.id);
const sellerInspectionBypass = await post(
  `/v1/seller/returns/${requested.returnCase.id}/status`,
  {
    status: "inspection_complete",
    expected_version: 4,
    operation_key: `seller-inspection-bypass:${runId}`,
    note: "Seller attempted to bypass line evidence",
  },
  sellerHeaders(sellerA),
);
assert.equal(sellerInspectionBypass.status, 409);
const sellerCloseAttempt = await post(
  `/v1/seller/returns/${requested.returnCase.id}/status`,
  {
    status: "closed",
    expected_version: 4,
    operation_key: `seller-close-attempt:${runId}`,
    note: "Seller attempted to close a refund return",
  },
  sellerHeaders(sellerA),
);
assert.equal(sellerCloseAttempt.status, 409);
const crossSellerInspection = await post(
  `/v1/seller/returns/${requested.returnCase.id}/inspection`,
  {
    expected_version: 4,
    note: "Other seller attempted inspection",
    lines: [{
      line_key: "line_1",
      received_qty: 1,
      condition: "damaged",
      disposition: "quarantine",
    }],
  },
  sellerHeaders(sellerB),
);
assert.equal(crossSellerInspection.status, 404);
const foreignLineInspection = await post(
  `/v1/seller/returns/${requested.returnCase.id}/inspection`,
  {
    expected_version: 4,
    note: "Attempted foreign allocation line",
    lines: [{
      line_key: "foreign_line",
      received_qty: 1,
      condition: "damaged",
      disposition: "quarantine",
    }],
  },
  sellerHeaders(sellerA),
);
assert.equal(foreignLineInspection.status, 400);
const staleInspection = await post(
  `/v1/seller/returns/${requested.returnCase.id}/inspection`,
  {
    expected_version: 3,
    note: "Stale inspection",
    lines: [{
      line_key: "line_1",
      received_qty: 1,
      condition: "damaged",
      disposition: "quarantine",
    }],
  },
  sellerHeaders(sellerA),
);
assert.equal(staleInspection.status, 409);
const noteMissingInspection = await post(
  `/v1/seller/returns/${requested.returnCase.id}/inspection`,
  {
    expected_version: 4,
    lines: [{
      line_key: "line_1",
      received_qty: 1,
      condition: "damaged",
      disposition: "quarantine",
    }],
  },
  sellerHeaders(sellerA),
);
assert.equal(noteMissingInspection.status, 400);
assert.deepEqual(
  await returnMutationCounts(requested.returnCase.id),
  beforeInspectionDenials,
);

const inspection = await post(
  `/v1/seller/returns/${requested.returnCase.id}/inspection`,
  {
    expected_version: 4,
    note: "Received line inspected; visible damage confirmed",
    lines: [{
      line_key: "line_1",
      received_qty: 1,
      condition: "damaged",
      disposition: "quarantine",
      note: "Packaging crushed and surface cracked",
    }],
  },
  sellerHeaders(sellerA),
);
assert.equal(inspection.status, 200);
const inspectionBody = (await inspection.json()) as {
  return: {
    status: string;
    version: number;
    lines: Array<{ inspectionNote: string | null }>;
  };
};
assert.equal(inspectionBody.return.status, "inspection_complete");
assert.equal(inspectionBody.return.version, 5);
assert.ok(inspectionBody.return.lines.every((line) => line.inspectionNote));

const explicitRefundBody = {
  expected_version: 5,
  operation_key: `http-refund-simulation:${runId}`,
  amount_minor: 1220,
  currency_code: "INR",
  method: "original_method_simulation",
  breakdown: {
    item_subtotal_minor: 1000,
    tax_minor: 180,
    shipping_minor: 100,
    restocking_fee_minor: 40,
    return_freight_minor: 20,
  },
};
const beforeInvalidRefunds = await returnMutationCounts(requested.returnCase.id);
const mismatchRefund = await post(
  `/v1/admin/returns/${requested.returnCase.id}/refund-simulation`,
  {
    ...explicitRefundBody,
    operation_key: `http-refund-mismatch:${runId}`,
    amount_minor: 1200,
  },
  adminHeaders,
);
assert.equal(mismatchRefund.status, 400);
const staleRefund = await post(
  `/v1/admin/returns/${requested.returnCase.id}/refund-simulation`,
  {
    ...explicitRefundBody,
    operation_key: `http-refund-stale:${runId}`,
    expected_version: 4,
  },
  adminHeaders,
);
assert.equal(staleRefund.status, 409);
assert.deepEqual(
  await returnMutationCounts(requested.returnCase.id),
  beforeInvalidRefunds,
);

const refund = await post(
  `/v1/admin/returns/${requested.returnCase.id}/refund-simulation`,
  explicitRefundBody,
  adminHeaders,
);
assert.equal(refund.status, 200);
const refundBody = (await refund.json()) as {
  return: { status: string; version: number };
  refund_simulation: {
    id: string;
    status: string;
    amountMinor: number;
    simulationReference: string;
    moneyEffect: string;
    stockEffect: string;
  };
  duplicate: boolean;
};
assert.equal(refundBody.return.status, "closed");
assert.equal(refundBody.return.version, 6);
assert.equal(refundBody.refund_simulation.status, "simulated_completed");
assert.equal(refundBody.refund_simulation.amountMinor, 1220);
assert.match(refundBody.refund_simulation.simulationReference, /^SIM-/);
assert.equal(refundBody.refund_simulation.moneyEffect, "none");
assert.equal(refundBody.refund_simulation.stockEffect, "none");
assert.equal(refundBody.duplicate, false);

const replayRefund = await post(
  `/v1/admin/returns/${requested.returnCase.id}/refund-simulation`,
  explicitRefundBody,
  adminHeaders,
);
assert.equal(replayRefund.status, 200);
const replayRefundBody = (await replayRefund.json()) as {
  refund_simulation: { id: string };
  duplicate: boolean;
};
assert.equal(replayRefundBody.duplicate, true);
assert.equal(replayRefundBody.refund_simulation.id, refundBody.refund_simulation.id);

const secondRefund = await post(
  `/v1/admin/returns/${requested.returnCase.id}/refund-simulation`,
  { ...explicitRefundBody, operation_key: `http-second-refund:${runId}` },
  adminHeaders,
);
assert.equal(secondRefund.status, 409);

const sellerAfterRefund = await get(
  `/v1/seller/returns/${requested.returnCase.id}`,
  sellerHeaders(sellerA),
);
assert.equal(sellerAfterRefund.status, 200);
const sellerAfterRefundBody = (await sellerAfterRefund.json()) as {
  return: {
    refundSimulation: null;
    events: Array<{ eventType: string; detail: Record<string, unknown> }>;
  };
};
assert.equal(sellerAfterRefundBody.return.refundSimulation, null);
const sellerRefundEvent = sellerAfterRefundBody.return.events.find(
  (event) => event.eventType === "return.refund_simulation_recorded",
);
assert.ok(sellerRefundEvent);
assert.equal("amount_minor" in (sellerRefundEvent?.detail ?? {}), false);
assert.equal("breakdown" in (sellerRefundEvent?.detail ?? {}), false);

const ownerReturnAfterRefund = await get(
  `/v1/returns/${requested.returnCase.id}`,
  bearerHeaders(ownerToken),
);
assert.equal(ownerReturnAfterRefund.status, 200);
const ownerReturnAfterRefundBody = (await ownerReturnAfterRefund.json()) as {
  return: { refundSimulation: { amountMinor: number; simulationReference: string } };
};
assert.equal(ownerReturnAfterRefundBody.return.refundSimulation.amountMinor, 1220);
assert.match(ownerReturnAfterRefundBody.return.refundSimulation.simulationReference, /^SIM-/);

const closureDomainEvents = await pool.query<{
  event_type: string;
  payload: Record<string, unknown>;
}>(
  `SELECT event_type, payload FROM domain_event
    WHERE aggregate_type = 'return' AND aggregate_id = $1
      AND event_type IN ('return.inspection_completed','return.refund_simulation_recorded')
    ORDER BY occurred_at`,
  [requested.returnCase.id],
);
assert.equal(
  closureDomainEvents.rows.filter((event) => event.event_type === "return.inspection_completed").length,
  1,
);
assert.equal(
  closureDomainEvents.rows.filter((event) => event.event_type === "return.refund_simulation_recorded").length,
  1,
);
for (const event of closureDomainEvents.rows) {
  assert.equal(event.payload.test_data, true);
  assert.equal(event.payload.simulated, true);
  assert.equal(event.payload.money_effect, "none");
  assert.equal(event.payload.stock_effect, "none");
}
const refundDomainEvent = closureDomainEvents.rows.find(
  (event) => event.event_type === "return.refund_simulation_recorded",
);
assert.match(String(refundDomainEvent?.payload.simulation_reference), /^SIM-/);

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

const internalClosureEvents = await pool.query<{
  event_type: string;
  detail: Record<string, unknown>;
}>(
  `SELECT event_type, detail FROM pilot_return_event
    WHERE return_case_id = $1
      AND event_type IN ('return.inspection_completed','return.refund_simulation_recorded')`,
  [requested.returnCase.id],
);
assert.equal(internalClosureEvents.rows.length, 2);
for (const event of internalClosureEvents.rows) {
  assert.equal(event.detail.test_data, true);
  assert.equal(event.detail.simulated, true);
  assert.equal(event.detail.money_effect, "none");
  assert.equal(event.detail.stock_effect, "none");
}

const logoutOwner = await post("/v1/auth/logout", {}, {
  ...publicHeaders,
  ...bearerHeaders(ownerToken),
});
assert.equal(logoutOwner.status, 204);
const logoutOther = await post("/v1/auth/logout", {}, {
  ...publicHeaders,
  ...bearerHeaders(otherToken),
});
assert.equal(logoutOther.status, 204);

await pool.query(
  `DELETE FROM pilot_notification
    WHERE source_event_id IN (
      SELECT id::text FROM domain_event WHERE correlation_id = $1
    )`,
  [testCorrelationId],
);
await pool.query("DELETE FROM domain_event WHERE correlation_id = $1", [testCorrelationId]);
await pool.query("DELETE FROM pilot_privileged_audit WHERE correlation_id = $1", [testCorrelationId]);
await pool.query("DELETE FROM pilot_return_case WHERE id = $1", [requested.returnCase.id]);
await pool.query("DELETE FROM pilot_shipment WHERE id = $1", [booked.shipment.id]);
await pool.query("DELETE FROM correlation WHERE checkout_ref = $1", [checkoutRef]);
const cleanupCounts = await pool.query<{ count: number }>(
  `SELECT (
      (SELECT count(*) FROM domain_event WHERE correlation_id = $1) +
      (SELECT count(*) FROM pilot_privileged_audit WHERE correlation_id = $1) +
      (SELECT count(*) FROM pilot_return_case WHERE id = $2) +
      (SELECT count(*) FROM pilot_shipment WHERE id = $3) +
      (SELECT count(*) FROM correlation WHERE checkout_ref = $4)
    )::int AS count`,
  [testCorrelationId, requested.returnCase.id, booked.shipment.id, checkoutRef],
);
assert.equal(Number(cleanupCounts.rows[0]?.count ?? -1), 0);
await pool.end();
await shipmentStore.close();
await returnStore.close();
await correlation.close();
console.log("manual-transition-http-test: pass");
