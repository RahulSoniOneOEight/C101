import assert from "node:assert/strict";
import {
  ROLE_TEMPLATES,
  permissionsForRoles,
  canActForSeller,
} from "../lib/rbac";

const p = (roles: string[]) => permissionsForRoles(roles);

assert.ok(p(["seller_admin"]).has("price.update"));
assert.ok(!p(["seller_admin"]).has("refund.approve"));
assert.ok(!p(["seller_admin"]).has("inventory-adjustment.post"));
assert.ok(!p(["seller_admin"]).has("acting-for-seller"));
assert.ok(p(["catalogue_admin"]).has("listing.approve"));
assert.ok(!p(["catalogue_admin"]).has("refund.execute"));
assert.ok(!p(["catalogue_admin"]).has("inventory-adjustment.post"));
assert.ok(p(["marketplace_admin"]).has("acting-for-seller"));
assert.ok(!p(["marketplace_admin"]).has("price.override-hold"));
assert.ok(p(["finance"]).has("refund.execute"));
assert.ok(!p(["finance"]).has("listing.update"));
assert.ok(p(["erp_operator"]).has("inventory-adjustment.post"));
assert.ok(!p(["erp_operator"]).has("inventory-adjustment.submit"));
assert.ok(p(["support"]).has("payment-evidence.record"));
assert.ok(!p(["support"]).has("refund.approve"));
assert.ok(p(["support"]).has("return.read"));
assert.ok(p(["super_admin"]).has("refund.execute"));
assert.ok(p(["super_admin"]).has("inventory-adjustment.post"));

// Combined roles are the explicit union.
assert.ok(p(["finance", "support"]).has("refund.approve"));
assert.ok(p(["finance", "support"]).has("order.read"));
// Unknown roles and permissions fail closed.
assert.equal(p(["unknown_role"]).size, 0);
assert.ok(!p(["seller_admin"]).has("unknown.permission" as never));
assert.ok(!p(["seller_admin"]).has("refund.execute"));

// Seller roles cannot act for another seller; admin catalogue/marketplace can.
assert.equal(
  canActForSeller({
    auth_context: { actor_type: "user" },
  } as never),
  true,
);
assert.equal(
  canActForSeller({
    auth_context: { actor_type: "user" },
    seller_context: { seller_id: "sel_1" },
  } as never),
  false,
);

for (const [role, template] of Object.entries(ROLE_TEMPLATES)) {
  assert.ok(Array.isArray(template.permissions), `${role} permissions`);
  assert.ok(template.scope, `${role} scope`);
}

console.log("RBAC matrix tests passed");
