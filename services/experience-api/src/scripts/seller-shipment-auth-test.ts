import assert from "node:assert/strict";
import pg from "pg";
import { loadConfig } from "../config.js";
import { ShipmentStore } from "../logistics/shipment-store.js";

/**
 * Proves seller scoping: seller A sees and updates its shipment; seller B cannot see or update it.
 * Run against a local/staging Experience API with the dummy service secret.
 */

const config = loadConfig(process.env);
const base = process.env.EXPERIENCE_BASE_URL ?? "http://localhost:9020";
const secret =
  process.env.BUILDKART_ADMIN_SERVICE_SECRET ??
  "buildkart-staging-dummy-admin-service-secret";
const runId = Date.now().toString(36);
const sellerA = `seller_a_${runId}`;
const sellerB = `seller_b_${runId}`;
const store = new ShipmentStore(config.experienceDatabaseUrl);
const booked = await store.book({
  orderGroupId: `og_seller_${runId}`,
  allocationId: `alloc_seller_${runId}`,
  sellerId: sellerA,
  lines: [{ lineKey: "line_seller", sku: "SKU-SELLER", orderedQty: 2 }],
});

const sellerFetch = (sellerId: string | null, path: string, init?: RequestInit) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-buildkart-admin-service-secret": secret,
      ...(sellerId ? { "x-buildkart-seller-id": sellerId } : {}),
      ...init?.headers,
    },
  });

const unauth = await sellerFetch(null, "/v1/seller/shipments");
assert.equal(unauth.status, 401);

const listA = await sellerFetch(sellerA, "/v1/seller/shipments");
assert.equal(listA.status, 200);
const listABody = (await listA.json()) as { items: Array<{ id: string }> };
assert.ok(listABody.items.some((shipment) => shipment.id === booked.shipment.id));

const listB = await sellerFetch(sellerB, "/v1/seller/shipments");
assert.equal(listB.status, 200);
const listBBody = (await listB.json()) as { items: Array<{ id: string }> };
assert.ok(!listBBody.items.some((shipment) => shipment.id === booked.shipment.id));

const crossUpdate = await sellerFetch(
  sellerB,
  `/v1/seller/shipments/${booked.shipment.id}/status`,
  {
    method: "POST",
    body: JSON.stringify({
      status: "in_transit",
      expected_version: booked.shipment.version,
      operation_key: `seller-cross:${runId}`,
    }),
  },
);
assert.equal(crossUpdate.status, 404);

const sellerCancellation = await sellerFetch(
  sellerA,
  `/v1/seller/shipments/${booked.shipment.id}/status`,
  {
    method: "POST",
    body: JSON.stringify({
      status: "cancelled",
      expected_version: booked.shipment.version,
      operation_key: `seller-cancel:${runId}`,
      reason: "Seller attempted to cancel",
    }),
  },
);
assert.equal(sellerCancellation.status, 403);

const ownUpdate = await sellerFetch(
  sellerA,
  `/v1/seller/shipments/${booked.shipment.id}/status`,
  {
    method: "POST",
    body: JSON.stringify({
      status: "in_transit",
      expected_version: booked.shipment.version,
      operation_key: `seller-auth:${runId}`,
    }),
  },
);
assert.ok(ownUpdate.status === 200 || ownUpdate.status === 201);
const updated = await store.get(booked.shipment.id);
assert.equal(updated?.status, "in_transit");

const detailB = await sellerFetch(
  sellerB,
  `/v1/seller/shipments/${booked.shipment.id}`,
);
assert.equal(detailB.status, 404);

const pool = new pg.Pool({ connectionString: config.experienceDatabaseUrl });
await pool.query("DELETE FROM pilot_shipment WHERE id = $1", [booked.shipment.id]);
await pool.end();
await store.close();
console.log("seller-shipment-auth-test: pass");
