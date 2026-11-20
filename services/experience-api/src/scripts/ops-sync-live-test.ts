import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { CloudflareAccessGroupSync } from "../auth/ops-cloudflare-sync.js";
import { decodeOpsEncryptionKey, OpsStaffStore } from "../auth/ops-staff.js";
import { loadConfig } from "../config.js";

/**
 * Live staging test for the Cloudflare Access group sync. Creates one temporary staff row, verifies
 * the real group membership on invite, role change and disable, then deletes the row.
 */

const config = loadConfig(process.env);
if (!config.cloudflareAccessSyncEnabled) {
  console.error("SKIP: Cloudflare Access group sync is not configured.");
  process.exit(2);
}

const store = new OpsStaffStore(
  config.experienceDatabaseUrl,
  decodeOpsEncryptionKey(config.opsTotpEncryptionKey as string),
);
const sync = new CloudflareAccessGroupSync({
  accountId: config.cloudflareAccountId as string,
  apiToken: config.cloudflareAccessApiToken as string,
  staffGroupId: config.cloudflareAccessStaffGroupId as string,
  erpGroupId: config.cloudflareAccessErpGroupId as string,
});
const cleanup = new pg.Pool({ connectionString: config.experienceDatabaseUrl, max: 1 });
const email = `ops-sync-${randomUUID()}@buildkart.test`;
const actor = "ops-sync-test@buildkart.test";

async function groupHas(groupId: string, address: string): Promise<boolean> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/access/groups/${groupId}`,
    { headers: { authorization: `Bearer ${config.cloudflareAccessApiToken}` } },
  );
  const body = (await response.json()) as {
    result?: { include?: Array<{ email?: { email?: string } }> };
  };
  return (body.result?.include ?? []).some(
    (entry) => entry.email?.email?.trim().toLowerCase() === address.toLowerCase(),
  );
}

try {
  const created = await store.create({
    email,
    name: "Sync Test",
    roles: ["support_operator"],
    actorEmail: actor,
    reason: "live sync test",
  });
  const added = await sync.syncUser({
    email: created.email,
    roles: created.roles,
    status: created.status,
  });
  assert.equal(added.ok, true, added.errors.join("; "));
  assert.equal(await groupHas(config.cloudflareAccessStaffGroupId as string, email), true);
  console.log("PASS invite adds the email to the real Staff group");

  const moved = await store.setRoles(email, ["finance_operator"], actor, "live sync role move");
  assert.ok(moved);
  const movedSync = await sync.syncUser({
    email: moved.email,
    roles: moved.roles,
    status: moved.status,
  });
  assert.equal(movedSync.ok, true, movedSync.errors.join("; "));
  assert.equal(await groupHas(config.cloudflareAccessErpGroupId as string, email), true);
  assert.equal(await groupHas(config.cloudflareAccessStaffGroupId as string, email), false);
  console.log("PASS role change moves the email from Staff to ERP");

  const disabled = await store.setStatus(email, "disabled", actor, "live sync disable");
  assert.ok(disabled);
  const removed = await sync.syncUser({
    email: disabled.email,
    roles: disabled.roles,
    status: disabled.status,
  });
  assert.equal(removed.ok, true, removed.errors.join("; "));
  assert.equal(await groupHas(config.cloudflareAccessErpGroupId as string, email), false);
  console.log("PASS disable removes the email from the real ERP group");

  const reconciled = await sync.reconcile([{ email, roles: ["support_operator"], status: "active" }]);
  assert.equal(reconciled.ok, true, reconciled.errors.join("; "));
  assert.equal(await groupHas(config.cloudflareAccessStaffGroupId as string, email), true);
  console.log("PASS reconcile re-adds an active staff email");

  console.log("ALL LIVE CLOUDFLARE GROUP SYNC CHECKS PASSED");
} finally {
  try {
    await sync.syncUser({ email, roles: ["support_operator"], status: "disabled" });
  } catch {
    // best effort
  }
  try {
    await cleanup.query(
      "DELETE FROM ops_staff_audit WHERE staff_id IN (SELECT id FROM ops_staff WHERE lower(email) = lower($1))",
      [email],
    );
    await cleanup.query("DELETE FROM ops_staff WHERE lower(email) = lower($1)", [email]);
  } finally {
    await cleanup.end();
    await store.close();
  }
}
