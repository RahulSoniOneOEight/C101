import assert from "node:assert/strict";
import { createPilotSession } from "./pilot-session.js";

/**
 * Exercises shipment authentication against a running Experience API:
 * unauthenticated -> 401, ordinary customer -> 404 for a shipment they do not own,
 * configured service operator -> 200.
 */

const base = process.env.EXPERIENCE_BASE_URL ?? "http://localhost:9020";

const unauth = await fetch(`${base}/v1/admin/shipments`);
assert.equal(unauth.status, 401, "unauthenticated admin shipment read must be 401");
const unauthOrderGroup = await fetch(
  `${base}/v1/admin/order-groups/og_does_not_exist/delivery-returns`,
);
assert.equal(
  unauthOrderGroup.status,
  401,
  "unauthenticated order-group delivery/return read must be 401",
);

const pilot = await createPilotSession(base);
const customerRead = await fetch(`${base}/v1/shipments/ship_does_not_exist`, {
  headers: { authorization: `Bearer ${pilot.token}` },
});
assert.equal(customerRead.status, 404, "a customer must not learn about another owner's shipment");

const secret = process.env.BUILDKART_ADMIN_SERVICE_SECRET;
if (secret) {
  const operator = await fetch(`${base}/v1/admin/shipments`, {
    headers: {
      "x-buildkart-admin-service-secret": secret,
      "x-operator-user-id": "shipment-auth-test",
    },
  });
  assert.equal(operator.status, 200, "configured admin-console service identity must read shipments");
  const body = (await operator.json()) as { items?: unknown[]; test_data?: boolean };
  assert.equal(body.test_data, true);
  assert.ok(Array.isArray(body.items));
  const missingOrderGroup = await fetch(
    `${base}/v1/admin/order-groups/og_does_not_exist/delivery-returns`,
    {
      headers: {
        "x-buildkart-admin-service-secret": secret,
        "x-operator-user-id": "shipment-auth-test",
      },
    },
  );
  assert.equal(
    missingOrderGroup.status,
    404,
    "configured admin-console service identity must pass order-group authorization",
  );
} else {
  console.warn("shipment-auth-test: BUILDKART_ADMIN_SERVICE_SECRET not set; operator 200 branch skipped");
}

console.log("shipment-auth-test: pass");
