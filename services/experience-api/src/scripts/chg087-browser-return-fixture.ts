import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { ShipmentStore } from "../logistics/shipment-store.js";
import { CorrelationStore } from "../store/correlation-store.js";
import { ReturnStore } from "../store/return-store.js";
import pg from "pg";

/**
 * CHG-087 retained browser-QC fixture.
 *
 * Creates one synthetic, owner-scoped closed return through the real store lifecycle and captures
 * the exact Admin, Seller and customer responses at each state for local visual review. It never
 * calls Medusa, Tryton, a PSP or a carrier. Run against the isolated CHG-087 database only.
 */

if (process.env.CHG087_ISOLATED_ACCEPTANCE !== "true") {
  throw new Error(
    "Set CHG087_ISOLATED_ACCEPTANCE=true and point the database at the disposable CHG-087 PostgreSQL.",
  );
}

const config = loadConfig(process.env);
const base = process.env.EXPERIENCE_BASE_URL ?? "http://127.0.0.1:59020";
const secret =
  process.env.BUILDKART_ADMIN_SERVICE_SECRET ??
  "buildkart-staging-dummy-admin-service-secret";
const fixtureId = process.env.CHG087_FIXTURE_ID ?? "chg087_qc_01";
const ownerUserId = process.env.CHG087_OWNER_USER_ID ?? "pilot_01";
const ownerIdentifier = process.env.CHG087_OWNER_IDENTIFIER ?? "pilot1@buildkart.test";
const sellerId = process.env.CHG087_SELLER_ID ?? "seller_qc_01";
const orderGroupId = `og_${fixtureId}`;
const checkoutRef = `checkout_${fixtureId}`;
const correlationId = `chg087-browser-${fixtureId}`;
const evidenceDir = path.resolve(
  process.cwd(),
  "../../client-projects/client101/evidence/CHG-087/fixtures",
);
const pool = new pg.Pool({ connectionString: config.experienceDatabaseUrl });
const correlation = new CorrelationStore(config.experienceDatabaseUrl);
const shipments = new ShipmentStore(config.experienceDatabaseUrl);
const returns = new ReturnStore(config.experienceDatabaseUrl);

const adminHeaders = {
  "content-type": "application/json",
  "x-buildkart-admin-service-secret": secret,
  "x-operator-user-id": "chg087-browser-fixture",
  "x-correlation-id": correlationId,
};
const sellerHeaders = {
  ...adminHeaders,
  "x-buildkart-seller-id": sellerId,
};
const publicHeaders = {
  "content-type": "application/json",
  "x-correlation-id": correlationId,
};

const getJson = async <T>(
  pathname: string,
  headers: Record<string, string>,
): Promise<T> => {
  const response = await fetch(`${base}${pathname}`, { headers });
  const text = await response.text();
  assert.equal(
    response.status,
    200,
    `${pathname} -> ${response.status}: ${text.slice(0, 300)}`,
  );
  return JSON.parse(text) as T;
};

const postJson = async <T>(
  pathname: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  expectedStatus: number,
): Promise<T> => {
  const response = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  assert.equal(
    response.status,
    expectedStatus,
    `${pathname} -> ${response.status}: ${text.slice(0, 300)}`,
  );
  return (text ? JSON.parse(text) : undefined) as T;
};

const customerSession = async (): Promise<string> => {
  const challenge = await postJson<{ challenge_id: string }>(
    "/v1/auth/otp/challenges",
    { identifier: ownerIdentifier },
    publicHeaders,
    201,
  );
  const verified = await postJson<{ session_token: string }>(
    "/v1/auth/otp/verify",
    { challenge_id: challenge.challenge_id, code: config.pilotOtpCode },
    publicHeaders,
    200,
  );
  return verified.session_token;
};

const snapshots: Record<string, unknown> = {};

async function capture(stage: string, returnId: string, token: string) {
  const [admin, seller, meOrders, order, customerReturn] = await Promise.all([
    getJson<Record<string, unknown>>(`/v1/admin/returns/${returnId}`, adminHeaders),
    getJson<Record<string, unknown>>(`/v1/seller/returns/${returnId}`, sellerHeaders),
    getJson<Record<string, unknown>>("/v1/me/orders", {
      authorization: `Bearer ${token}`,
      "x-correlation-id": correlationId,
    }),
    getJson<Record<string, unknown>>(`/v1/orders/${checkoutRef}`, {
      authorization: `Bearer ${token}`,
      "x-correlation-id": correlationId,
    }),
    getJson<Record<string, unknown>>(`/v1/returns/${returnId}`, {
      authorization: `Bearer ${token}`,
      "x-correlation-id": correlationId,
    }),
  ]);
  snapshots[stage] = { admin, seller, meOrders, order, customerReturn };
  console.log(`captured ${stage}`);
}

try {
  await mkdir(evidenceDir, { recursive: true });

  // Idempotent re-run: remove only this fixture's rows.
  const existingReturns = await pool.query<{ id: string }>(
    "SELECT id FROM pilot_return_case WHERE order_id = $1",
    [checkoutRef],
  );
  for (const row of existingReturns.rows) {
    await pool.query("DELETE FROM pilot_return_case WHERE id = $1", [row.id]);
  }
  const existingShipments = await pool.query<{ id: string }>(
    "SELECT id FROM pilot_shipment WHERE order_group_id = $1",
    [orderGroupId],
  );
  for (const row of existingShipments.rows) {
    await pool.query("DELETE FROM pilot_shipment WHERE id = $1", [row.id]);
  }
  await pool.query("DELETE FROM correlation WHERE checkout_ref = $1", [checkoutRef]);
  await pool.query(
    `DELETE FROM pilot_notification
      WHERE source_event_id IN (
        SELECT id::text FROM domain_event WHERE correlation_id = $1
      )`,
    [correlationId],
  );
  await pool.query("DELETE FROM domain_event WHERE correlation_id = $1", [correlationId]);
  await pool.query("DELETE FROM pilot_privileged_audit WHERE correlation_id = $1", [
    correlationId,
  ]);

  const booked = await shipments.book({
    orderGroupId,
    allocationId: `alloc_${fixtureId}`,
    sellerId,
    lines: [
      { lineKey: "line_qc_1", sku: "BK-QC-DRILL-01", orderedQty: 1 },
      { lineKey: "line_qc_2", sku: "BK-QC-BITS-02", orderedQty: 1 },
    ],
    destinationPostcode: "302001",
  });

  await shipments.appendEvent({
    shipmentId: booked.shipment.id,
    providerEventId: `delivered:${fixtureId}`,
    eventType: "delivered",
    status: "delivered",
    occurredAt: new Date().toISOString(),
    proofRef: `POD-${fixtureId.toUpperCase()}`,
    deliveredLines: [
      { lineKey: "line_qc_1", deliveredQty: 1 },
      { lineKey: "line_qc_2", deliveredQty: 1 },
    ],
  });

  await correlation.link(checkoutRef, {
    orderGroup: orderGroupId,
    ownerUserId,
    trytonMove: 987654,
    orderGroupPayload: {
      id: orderGroupId,
      created_at: new Date().toISOString(),
      customer_reference: "BK-261028-QC087",
      currency_code: "inr",
      amounts: {
        subtotal: 299800,
        shipping: 4900,
        discount: 0,
        tax: 0,
        total: 304700,
      },
      lines: [
        {
          line_key: "line_qc_1",
          sku: "BK-QC-DRILL-01",
          title: "Cordless Drill Kit · 18V",
          quantity: 1,
          unit_price: 219900,
          product_id: "prod_qc_drill",
          variant_id: "variant_qc_drill",
          seller_id: sellerId,
        },
        {
          line_key: "line_qc_2",
          sku: "BK-QC-BITS-02",
          title: "Titanium Drill Bit Set · 18 pc",
          quantity: 1,
          unit_price: 79900,
          product_id: "prod_qc_bits",
          variant_id: "variant_qc_bits",
          seller_id: sellerId,
        },
      ],
    },
  });

  const requested = await returns.request({
    orderId: checkoutRef,
    orderGroupId,
    userId: ownerUserId,
    idempotencyKey: `browser-return:${fixtureId}`,
    policyVersion: "return-policy-2026-11-01",
    policySnapshot: {
      policy_version: "return-policy-2026-11-01",
      window_days: 7,
      planning_only: true,
    },
    resolution: "refund",
    reasonCode: "damaged",
    customerComment:
      "Both items arrived with damaged packaging; the drill housing is cracked.",
    lines: [
      {
        lineKey: "line_qc_1",
        sku: "BK-QC-DRILL-01",
        orderedQty: 1,
        deliveredQty: 1,
        requestedQty: 1,
        reasonCode: "damaged",
        unitPriceMinor: 219900,
      },
      {
        lineKey: "line_qc_2",
        sku: "BK-QC-BITS-02",
        orderedQty: 1,
        deliveredQty: 1,
        requestedQty: 1,
        reasonCode: "damaged",
        unitPriceMinor: 79900,
      },
    ],
  });

  await returns.decide({
    id: requested.returnCase.id,
    decision: "approved",
    actorId: "operator_qc",
    actorRole: "marketplace_operator",
    expectedVersion: requested.returnCase.version,
    comment: "Photo evidence reviewed. Both lines approved for return.",
    approvedLines: [
      { lineKey: "line_qc_1", approvedQty: 1 },
      { lineKey: "line_qc_2", approvedQty: 1 },
    ],
  });

  const token = await customerSession();
  await capture("approved", requested.returnCase.id, token);

  const received = await returns.updateStatus({
    id: requested.returnCase.id,
    status: "received",
    expectedVersion: 2,
    idempotencyKey: `browser-received:${fixtureId}`,
    actorId: sellerId,
    actorRole: "seller_admin",
    note: "Reverse pickup received at Jaipur DC and logged for inspection.",
  });
  assert.equal(received.returnCase.status, "received");
  await capture("received", requested.returnCase.id, token);

  const inspected = await returns.inspect({
    id: requested.returnCase.id,
    expectedVersion: 3,
    actorId: sellerId,
    actorRole: "seller_admin",
    note: "Both approved lines inspected on receipt. Evidence recorded only; no stock movement.",
    allowedLineKeys: ["line_qc_1", "line_qc_2"],
    lines: [
      {
        lineKey: "line_qc_1",
        receivedQty: 1,
        condition: "damaged",
        disposition: "quarantine",
        note: "Housing cracked; packaging crushed in transit.",
      },
      {
        lineKey: "line_qc_2",
        receivedQty: 1,
        condition: "incomplete",
        disposition: "repair",
        note: "Case hinge broken; bit set complete.",
      },
    ],
  });
  assert.equal(inspected.status, "inspection_complete");
  await capture("inspection_complete", requested.returnCase.id, token);

  const refund = await returns.recordRefundSimulation({
    id: requested.returnCase.id,
    expectedVersion: 4,
    operationKey: `browser-refund:${fixtureId}`,
    actorId: "operator_qc",
    actorRole: "marketplace_operator",
    method: "original_method_simulation",
    amountMinor: 304700,
    currencyCode: "INR",
    breakdown: {
      itemSubtotalMinor: 299800,
      taxMinor: 0,
      shippingMinor: 4900,
      restockingFeeMinor: 0,
      returnFreightMinor: 0,
    },
  });
  assert.equal(refund.returnCase.status, "closed");
  assert.equal(refund.refundSimulation.status, "simulated_completed");
  await capture("closed", requested.returnCase.id, token);

  await postJson(
    "/v1/auth/logout",
    {},
    { ...publicHeaders, authorization: `Bearer ${token}` },
    204,
  );

  const summary = {
    fixture_id: fixtureId,
    order_id: checkoutRef,
    order_group_id: orderGroupId,
    return_id: requested.returnCase.id,
    shipment_id: booked.shipment.id,
    seller_id: sellerId,
    owner_user_id: ownerUserId,
    policy_version: "return-policy-2026-11-01",
    final_status: refund.returnCase.status,
    final_version: refund.returnCase.version,
    refund_simulation_reference: refund.refundSimulation.simulationReference,
    refund_amount_minor: refund.refundSimulation.amountMinor,
    money_effect: refund.refundSimulation.moneyEffect,
    stock_effect: refund.refundSimulation.stockEffect,
    captured_stages: Object.keys(snapshots),
    test_data: true,
  };
  await writeFile(
    path.join(evidenceDir, "lifecycle-snapshots.json"),
    JSON.stringify({ summary, snapshots }, null, 2),
    "utf8",
  );
  await writeFile(
    path.join(evidenceDir, "fixture-summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await Promise.allSettled([correlation.close(), shipments.close(), returns.close(), pool.end()]);
}
