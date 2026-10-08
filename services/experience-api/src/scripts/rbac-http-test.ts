import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadPilotAuthorizations, type PilotRole } from "../auth/pilot-authorization.js";
import { loadPilotUsers, PilotUserDirectory } from "../auth/pilot-users.js";
import { loadConfig } from "../config.js";
import { NotificationStore } from "../store/notification-store.js";

const config = loadConfig(process.env);
const directory = new PilotUserDirectory(loadPilotUsers(config.pilotUsersJson, config.pilotExpectedUserCount));
const authorizations = loadPilotAuthorizations(
  config.pilotRoleAssignmentsJson,
  directory.users,
  true,
);
const base = `http://127.0.0.1:${config.port}`;
const sourceEventId = randomUUID();
const notificationStore = new NotificationStore(config.experienceDatabaseUrl);
const cleanup = new pg.Pool({ connectionString: config.experienceDatabaseUrl, max: 1 });

function userWith(role: PilotRole, excluding?: string) {
  const authorization = [...authorizations.values()].find((item) =>
    item.userId !== excluding && item.roles.includes(role)
  );
  assert.ok(authorization, `missing test identity for ${role}`);
  const user = directory.get(authorization.userId);
  assert.ok(user);
  return user;
}

async function response(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${base}${path}`, init);
}

async function json(path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const result = await response(path, init);
  const text = await result.text();
  return { status: result.status, body: text ? JSON.parse(text) as Record<string, unknown> : {} };
}

async function login(email: string): Promise<string> {
  const challenge = await json("/v1/auth/otp/challenges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: email }),
  });
  assert.equal(challenge.status, 201);
  const verified = await json("/v1/auth/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challenge_id: challenge.body.challenge_id, code: config.pilotOtpCode }),
  });
  assert.equal(verified.status, 200);
  return String(verified.body.session_token);
}

const server = Bun.spawn([process.execPath, "run", "src/index.ts"], {
  cwd: process.cwd(),
  env: process.env,
  stdout: "inherit",
  stderr: "inherit",
});

try {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await response("/health").then((item) => item.status < 500).catch(() => false)) break;
    await Bun.sleep(250);
  }

  const customer = userWith("customer");
  const otherCustomer = userWith("customer", customer.id);
  const finance = userWith("finance_operator");
  const erp = userWith("erp_operator");
  const seller = userWith("seller_admin");
  const superAdmin = userWith("super_admin");
  const [customerToken, otherToken, financeToken, erpToken, sellerToken, superToken] = await Promise.all([
    login(customer.email),
    login(otherCustomer.email),
    login(finance.email),
    login(erp.email),
    login(seller.email),
    login(superAdmin.email),
  ]);
  const auth = (token: string, extra: Record<string, string> = {}) => ({
    authorization: `Bearer ${token}`,
    ...extra,
  });

  assert.equal((await response("/metrics", { headers: auth(customerToken, { "x-pilot-role": "super_admin" }) })).status, 404);
  assert.equal((await response("/metrics", { headers: auth(financeToken) })).status, 200);
  assert.equal((await response("/v1/carts", {
    method: "POST",
    headers: { ...auth(sellerToken), "content-type": "application/json" },
    body: "{}",
  })).status, 404, "seller identity obtained customer cart authority");

  const sku = `RBAC-${randomUUID().slice(0, 8)}`;
  assert.equal((await response("/v1/admin/inventory/available", {
    method: "POST",
    headers: { ...auth(customerToken), "content-type": "application/json" },
    body: JSON.stringify({ sku, available: 10 }),
  })).status, 404);
  assert.equal((await response("/v1/admin/inventory/available", {
    method: "POST",
    headers: { ...auth(superToken), "content-type": "application/json" },
    body: JSON.stringify({ sku, available: 10 }),
  })).status, 409, "super admin bypassed independent-approval guard");
  assert.equal((await response("/v1/admin/inventory/available", {
    method: "POST",
    headers: { ...auth(erpToken), "content-type": "application/json" },
    body: JSON.stringify({ sku, available: 10 }),
  })).status, 200);

  const audit = await json("/v1/ops/audit", { headers: auth(financeToken) });
  assert.equal(audit.status, 200);
  assert.ok((audit.body.items as Array<Record<string, unknown>>).some((item) =>
    item.path === "/v1/admin/inventory/available" && item.status === "succeeded"
  ));

  await notificationStore.create(customer.id, {
    templateKey: "order_confirmed_v1",
    title: "RBAC test",
    body: "Owner only",
    sourceEventId,
  });
  const ownerInbox = await json("/v1/me/notifications", { headers: auth(customerToken) });
  const otherInbox = await json("/v1/me/notifications", { headers: auth(otherToken) });
  const ownerItem = (ownerInbox.body.notifications as Array<Record<string, unknown>>)
    .find((item) => item.source_event_id === sourceEventId);
  assert.ok(ownerItem);
  assert.equal(
    (otherInbox.body.notifications as Array<Record<string, unknown>>)
      .some((item) => item.source_event_id === sourceEventId),
    false,
  );
  assert.equal((await response(`/v1/me/notifications/${ownerItem.id}/read`, {
    method: "POST",
    headers: auth(otherToken),
  })).status, 404);

  const device = await json("/v1/me/devices", {
    method: "POST",
    headers: { ...auth(customerToken), "content-type": "application/json" },
    body: JSON.stringify({
      token: `test-token-${randomUUID()}-${randomUUID()}`,
      platform: "android",
      firebase_project_id: "buildkart-staging",
    }),
  });
  assert.equal(device.status, 201);
  assert.equal((await response(`/v1/me/devices/${device.body.id}`, {
    method: "DELETE",
    headers: auth(otherToken),
  })).status, 404);

  console.log("PASS: hosted RBAC routes, audit records and notification/device ownership isolation.");
} finally {
  server.kill();
  await server.exited;
  await cleanup.query("DELETE FROM pilot_notification WHERE source_event_id = $1", [sourceEventId]).catch(() => undefined);
  await cleanup.query("DELETE FROM pilot_device_registration WHERE token LIKE 'test-token-%'").catch(() => undefined);
  await cleanup.query("DELETE FROM reservation_ledger WHERE sku LIKE 'RBAC-%'").catch(() => undefined);
  await cleanup.end();
  await notificationStore.close();
}
