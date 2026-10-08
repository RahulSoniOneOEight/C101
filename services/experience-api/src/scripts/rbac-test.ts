import assert from "node:assert/strict";
import { hasAnyRole, loadPilotAuthorizations } from "../auth/pilot-authorization.js";
import type { PilotUser } from "../auth/pilot-users.js";
import { loadConfig } from "../config.js";

const users: PilotUser[] = [
  { id: "customer", email: "customer@example.test", name: "Customer" },
  { id: "buyer", email: "buyer@example.test", name: "Buyer" },
  { id: "seller", email: "seller@example.test", name: "Seller" },
  { id: "finance", email: "finance@example.test", name: "Finance" },
];

const assignments = loadPilotAuthorizations(JSON.stringify([
  { userId: "customer", roles: ["customer"] },
  { userId: "buyer", roles: ["b2b_buyer"], businessAccountId: "business_a" },
  { userId: "seller", roles: ["seller_order_manager"], sellerId: "seller_a" },
  { userId: "finance", roles: ["finance_operator"] },
]), users, true);

assert.equal(assignments.size, 4);
assert.equal(hasAnyRole(assignments.get("customer")!, ["customer"]), true);
assert.equal(hasAnyRole(assignments.get("customer")!, ["finance_operator"]), false);
assert.equal(assignments.get("buyer")?.businessAccountId, "business_a");
assert.equal(assignments.get("seller")?.sellerId, "seller_a");

assert.throws(
  () => loadPilotAuthorizations(JSON.stringify([
    { userId: "buyer", roles: ["b2b_buyer"] },
  ]), [users[1]], true),
  /businessAccountId/,
);
assert.throws(
  () => loadPilotAuthorizations(JSON.stringify([
    { userId: "seller", roles: ["seller_order_manager"] },
  ]), [users[2]], true),
  /sellerId/,
);
assert.throws(
  () => loadPilotAuthorizations(JSON.stringify([
    { userId: "customer", roles: ["invented_admin"] },
  ]), [users[0]], true),
  /Unknown pilot role/,
);
assert.throws(
  () => loadConfig({
    BUILDKART_ENVIRONMENT: "staging",
    PAYMENT_ADAPTER_MODE: "simulated",
    PILOT_EXPECTED_USER_COUNT: "20",
  }),
  /PILOT_ROLE_ASSIGNMENTS_JSON is required/,
);
assert.throws(
  () => loadConfig({
    BUILDKART_ENVIRONMENT: "staging",
    PAYMENT_ADAPTER_MODE: "simulated",
    FCM_DELIVERY_ENABLED: "true",
    FIREBASE_PROJECT_ID: "production-project",
  }),
  /buildkart-staging Firebase project/,
);
assert.throws(
  () => loadConfig({
    BUILDKART_ENVIRONMENT: "staging",
    PAYMENT_ADAPTER_MODE: "simulated",
    FCM_DELIVERY_ENABLED: "true",
    FIREBASE_PROJECT_ID: "buildkart-staging",
  }),
  /approved notification template wording/,
);

console.log("PASS: server-owned pilot role assignments validate and fail closed.");
