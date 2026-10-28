import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { loadConfig } from "../config.js";
import { loadPilotUsers } from "../auth/pilot-users.js";
import { CorrelationStore } from "../store/correlation-store.js";
import { ShipmentStore } from "../logistics/shipment-store.js";

/**
 * CHG-087 staging smoke fixture.
 *
 * Creates one synthetic Experience-only order/return, drives the real HTTP lifecycle through
 * Admin/Seller/customer routes, verifies events/notifications and owner/seller boundaries, and
 * checks that Medusa/Tryton rows are unchanged. It never creates a Medusa order, payment, refund,
 * Tryton movement or real notification. Run only in the hosted staging private network.
 */

if (process.env.CHG087_STAGING_SMOKE !== "true") {
  throw new Error("Set CHG087_STAGING_SMOKE=true for the hosted staging smoke.");
}

const config = loadConfig(process.env);
const base = "http://experience-api:9020";
const fixtureId = process.env.CHG087_FIXTURE_ID ?? "chg087_staging_smoke";
const checkoutRef = `checkout_${fixtureId}`;
const orderGroupId = `og_${fixtureId}`;
const sellerId = process.env.CHG087_SELLER_ID ?? `seller_${fixtureId}`;
const correlationId = `chg087-staging-smoke`;
const cleanupOnly = process.env.CHG087_CLEANUP === "true";
const outFile = process.env.CHG087_OUT_FILE ?? "/out/chg087-fixture.json";
const pool = new pg.Pool({ connectionString: config.experienceDatabaseUrl });
const correlation = new CorrelationStore(config.experienceDatabaseUrl);
const shipments = new ShipmentStore(config.experienceDatabaseUrl);
const pilotUsers = loadPilotUsers(config.pilotUsersJson, config.pilotExpectedUserCount);
const owner = pilotUsers[0];
assert.ok(owner, "No staging pilot user is configured.");

const dbUrl = (database: string) =>
  config.experienceDatabaseUrl.replace(/\/buildkart_experience(\?|$)/, `/${database}$1`);
const medusaPool = new pg.Pool({ connectionString: dbUrl("buildkart") });
const trytonPool = new pg.Pool({ connectionString: dbUrl("buildkart_tryton") });

const request = async (
  path: string,
  init: RequestInit,
  expected: number | number[] = 200,
): Promise<any> => {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  assert.ok(
    expectedStatuses.includes(response.status),
    `${path} -> ${response.status}: ${text.slice(0, 300)}`,
  );
  return text ? JSON.parse(text) : undefined;
};

const jsonHeaders = (extra: Record<string, string> = {}) => ({
  "content-type": "application/json",
  "x-correlation-id": correlationId,
  ...extra,
});

const adminHeaders = jsonHeaders({
  "x-buildkart-admin-service-secret": config.adminServiceSecret,
  "x-operator-user-id": "chg087-staging-smoke",
});
const sellerHeaders = jsonHeaders({
  "x-buildkart-admin-service-secret": config.adminServiceSecret,
  "x-buildkart-seller-id": sellerId,
  "x-operator-user-id": "chg087-staging-smoke",
});

const zeroEffectSnapshot = async () => {
  const medusa = await medusaPool.query(
    `select 'payment' as name, count(*)::int as count from payment
     union all select 'refund', count(*)::int from refund
     union all select 'order_transaction', count(*)::int from order_transaction
     union all select 'payment_collection', count(*)::int from payment_collection
     union all select 'payment_session', count(*)::int from payment_session order by 1`,
  );
  const tryton = await trytonPool.query(
    `select 'stock_move' as name, count(*)::int as count from stock_move
     union all select 'stock_shipment_in', count(*)::int from stock_shipment_in
     union all select 'stock_shipment_out', count(*)::int from stock_shipment_out
     union all select 'stock_shipment_out_return', count(*)::int from stock_shipment_out_return order by 1`,
  );
  return {
    medusa: Object.fromEntries(medusa.rows.map((row) => [row.name, row.count])),
    tryton: Object.fromEntries(tryton.rows.map((row) => [row.name, row.count])),
  };
};

const cleanup = async () => {
  const returns = await pool.query<{ id: string }>(
    "select id from pilot_return_case where order_id = $1",
    [checkoutRef],
  );
  for (const row of returns.rows) {
    await pool.query("delete from pilot_return_case where id = $1", [row.id]);
  }
  const shipmentRows = await pool.query<{ id: string }>(
    "select id from pilot_shipment where order_group_id = $1",
    [orderGroupId],
  );
  for (const row of shipmentRows.rows) {
    await pool.query("delete from pilot_shipment where id = $1", [row.id]);
  }
  await pool.query("delete from correlation where checkout_ref = $1", [checkoutRef]);
  await pool.query(
    `delete from pilot_notification
      where source_event_id in (select id::text from domain_event where correlation_id = $1)`,
    [correlationId],
  );
  await pool.query("delete from domain_event where correlation_id = $1", [correlationId]);
  await pool.query("delete from pilot_privileged_audit where correlation_id = $1", [correlationId]);
};

try {
  if (cleanupOnly) {
    await cleanup();
    const remaining = await pool.query<{ count: number }>(
      `select (
        (select count(*) from pilot_return_case where order_id = $1) +
        (select count(*) from pilot_shipment where order_group_id = $2) +
        (select count(*) from correlation where checkout_ref = $1) +
        (select count(*) from domain_event where correlation_id = $3)
      )::int as count`,
      [checkoutRef, orderGroupId, correlationId],
    );
    assert.equal(Number(remaining.rows[0]?.count ?? -1), 0, "Staging fixture cleanup failed.");
    console.log(`staging-smoke-cleanup: pass (${fixtureId})`);
    process.exit(0);
  }

  await cleanup();
  const before = await zeroEffectSnapshot();

  const booked = await shipments.book({
    orderGroupId,
    allocationId: `alloc_${fixtureId}`,
    sellerId,
    lines: [
      { lineKey: "line_staging_1", sku: "BK-STG-DRILL-01", orderedQty: 1 },
      { lineKey: "line_staging_2", sku: "BK-STG-BITS-02", orderedQty: 1 },
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
      { lineKey: "line_staging_1", deliveredQty: 1 },
      { lineKey: "line_staging_2", deliveredQty: 1 },
    ],
  });
  await correlation.link(checkoutRef, {
    orderGroup: orderGroupId,
    ownerUserId: owner.id,
    orderGroupPayload: {
      id: orderGroupId,
      created_at: new Date().toISOString(),
      customer_reference: "BK-261028-STG087",
      currency_code: "inr",
      amounts: { subtotal: 299800, shipping: 4900, discount: 0, tax: 0, total: 304700 },
      lines: [
        {
          line_key: "line_staging_1",
          sku: "BK-STG-DRILL-01",
          title: "Cordless Drill Kit · 18V",
          quantity: 1,
          unit_price: 219900,
          product_id: "prod_stg_drill",
          variant_id: "variant_stg_drill",
          seller_id: sellerId,
        },
        {
          line_key: "line_staging_2",
          sku: "BK-STG-BITS-02",
          title: "Titanium Drill Bit Set · 18 pc",
          quantity: 1,
          unit_price: 79900,
          product_id: "prod_stg_bits",
          variant_id: "variant_stg_bits",
          seller_id: sellerId,
        },
      ],
    },
  });

  const challenge = await request(
    "/v1/auth/otp/challenges",
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ identifier: owner.email }) },
    201,
  );
  const verified = await request(
    "/v1/auth/otp/verify",
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ challenge_id: challenge.challenge_id, code: config.pilotOtpCode }),
    },
    200,
  );
  const ownerToken = verified.session_token as string;
  assert.ok(ownerToken);

  const created = await request(
    `/v1/orders/${checkoutRef}/returns`,
    {
      method: "POST",
      headers: jsonHeaders({ authorization: `Bearer ${ownerToken}`, "idempotency-key": `staging-return:${fixtureId}` }),
      body: JSON.stringify({
        resolution: "refund",
        reason_code: "damaged",
        customer_comment: "Staging smoke: both items arrived damaged.",
        lines: [
          { line_key: "line_staging_1", requested_qty: 1, reason_code: "damaged" },
          { line_key: "line_staging_2", requested_qty: 1, reason_code: "damaged" },
        ],
      }),
    },
    201,
  );
  const returnId = created.return.id as string;

  const approved = await request(
    `/v1/admin/returns/${returnId}/approve`,
    {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        expected_version: created.return.version,
        comment: "Staging smoke approval; evidence only.",
        approved_lines: [
          { line_key: "line_staging_1", approved_qty: 1 },
          { line_key: "line_staging_2", approved_qty: 1 },
        ],
      }),
    },
    200,
  );
  const received = await request(
    `/v1/seller/returns/${returnId}/status`,
    {
      method: "POST",
      headers: sellerHeaders,
      body: JSON.stringify({
        status: "received",
        expected_version: approved.return.version,
        operation_key: `staging-received:${fixtureId}`,
        note: "Staging smoke: reverse pickup received.",
      }),
    },
    200,
  );
  const inspected = await request(
    `/v1/seller/returns/${returnId}/inspection`,
    {
      method: "POST",
      headers: sellerHeaders,
      body: JSON.stringify({
        expected_version: received.return.version,
        note: "Staging smoke: complete line inspection; evidence only.",
        lines: [
          { line_key: "line_staging_1", received_qty: 1, condition: "damaged", disposition: "quarantine" },
          { line_key: "line_staging_2", received_qty: 1, condition: "incomplete", disposition: "repair" },
        ],
      }),
    },
    200,
  );
  const refundBody = {
    expected_version: inspected.return.version,
    operation_key: `staging-refund:${fixtureId}`,
    amount_minor: 304700,
    currency_code: "INR",
    method: "original_method_simulation",
    breakdown: {
      item_subtotal_minor: 299800,
      tax_minor: 0,
      shipping_minor: 4900,
      restocking_fee_minor: 0,
      return_freight_minor: 0,
    },
  };
  const refund = await request(
    `/v1/admin/returns/${returnId}/refund-simulation`,
    { method: "POST", headers: adminHeaders, body: JSON.stringify(refundBody) },
    200,
  );
  const replay = await request(
    `/v1/admin/returns/${returnId}/refund-simulation`,
    { method: "POST", headers: adminHeaders, body: JSON.stringify(refundBody) },
    200,
  );
  assert.equal(replay.duplicate, true);
  assert.equal(replay.refund_simulation.id, refund.refund_simulation.id);

  const ownerRead = await request(
    `/v1/returns/${returnId}`,
    { headers: jsonHeaders({ authorization: `Bearer ${ownerToken}` }) },
    200,
  );
  assert.equal(ownerRead.return.refundSimulation.amountMinor, 304700);
  const sellerRead = await request(
    `/v1/seller/returns/${returnId}`,
    { headers: sellerHeaders },
    200,
  );
  assert.equal(sellerRead.return.refundSimulation, null);

  const domainEvents = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
    `select event_type, payload from domain_event
      where aggregate_type = 'return' and aggregate_id = $1 order by occurred_at`,
    [returnId],
  );
  const inspectionEvents = domainEvents.rows.filter((row) => row.event_type === "return.inspection_completed");
  const refundEvents = domainEvents.rows.filter((row) => row.event_type === "return.refund_simulation_recorded");
  assert.equal(inspectionEvents.length, 1);
  assert.equal(refundEvents.length, 1);
  for (const event of domainEvents.rows) {
    assert.equal(event.payload.money_effect, "none");
    assert.equal(event.payload.stock_effect, "none");
  }
  for (const event of [...inspectionEvents, ...refundEvents]) {
    assert.equal(event.payload.test_data, true);
    assert.equal(event.payload.simulated, true);
  }

  let notifications = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rows = await pool.query<{ count: number }>(
      `select count(*)::int as count from pilot_notification
        where source_event_id in (
          select id::text from domain_event
           where aggregate_type = 'return' and aggregate_id = $1
             and event_type in ('return.inspection_completed','return.refund_simulation_recorded')
        )`,
      [returnId],
    );
    notifications = Number(rows.rows[0]?.count ?? 0);
    if (notifications >= 2) break;
    await Bun.sleep(1000);
  }
  assert.equal(notifications, 2);

  const after = await zeroEffectSnapshot();
  assert.deepEqual(after, before, "Medusa/Tryton rows changed during staging smoke.");

  const summary = {
    fixture_id: fixtureId,
    order_id: checkoutRef,
    order_group_id: orderGroupId,
    return_id: returnId,
    shipment_id: booked.shipment.id,
    seller_id: sellerId,
    owner_user_id: owner.id,
    owner_identifier: owner.email,
    final_status: refund.return.status,
    final_version: refund.return.version,
    refund_simulation_reference: refund.refund_simulation.simulationReference,
    refund_amount_minor: refund.refund_simulation.amountMinor,
    duplicate_replay: replay.duplicate,
    seller_refund_simulation: sellerRead.return.refundSimulation,
    domain_event_types: domainEvents.rows.map((row) => row.event_type),
    notifications,
    medusa_unchanged: true,
    tryton_unchanged: true,
    medusa_before: before.medusa,
    tryton_before: before.tryton,
    test_data: true,
  };
  await writeFile(outFile, JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(
    JSON.stringify({
      fixture_id: fixtureId,
      order_id: checkoutRef,
      return_id: returnId,
      final_status: summary.final_status,
      refund_simulation_reference: summary.refund_simulation_reference,
      notifications,
      medusa_unchanged: true,
      tryton_unchanged: true,
    }),
  );
} finally {
  await Promise.allSettled([
    correlation.close(),
    shipments.close(),
    pool.end(),
    medusaPool.end(),
    trytonPool.end(),
  ]);
}
