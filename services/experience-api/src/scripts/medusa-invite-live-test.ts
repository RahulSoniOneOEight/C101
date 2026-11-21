import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MedusaAdminInvites } from "../auth/medusa-invites.js";
import { loadConfig } from "../config.js";

/** Live staging check: create and revoke one Medusa admin invite. No token is printed. */

const config = loadConfig(process.env);
if (!config.medusaInviteAutomationEnabled) {
  console.error("SKIP: Medusa admin invite automation is not configured.");
  process.exit(2);
}

const invites = new MedusaAdminInvites({
  baseUrl: config.medusaBaseUrl,
  email: config.medusaAdminEmail as string,
  password: config.medusaAdminPassword as string,
  adminBaseUrl: config.publicOpsBaseUrl,
});

const email = `ops-invite-live-${randomUUID()}@buildkart.test`;
const invite = await invites.createInvite(email);
assert.ok(invite.id.startsWith("invite_"));
assert.equal(invite.email, email);
assert.ok(invite.token.length > 100);
assert.ok(
  invite.url.startsWith(`${config.publicOpsBaseUrl}/dashboard/invite?token=`),
  `unexpected invite URL: ${invite.url.slice(0, 80)}`,
);
console.log("PASS created a live Medusa admin invite with a set-password URL");

await invites.revokeInvite(invite.id);
console.log("PASS revoked the test invite");

console.log("ALL LIVE MEDUSA INVITE CHECKS PASSED");
