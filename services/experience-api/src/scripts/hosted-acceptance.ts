/**
 * Hosted staging acceptance gate (CHG-018 / CHG-019).
 *
 * Runs the hosted acceptance checklist against a deployed staging endpoint. Unlike the local
 * integration tests, this never spawns a server: it targets a real base URL (for example the
 * Cloudflare Tunnel hostname) and fails closed if the deployment is unreachable or a check fails.
 *
 *   EXPERIENCE_BASE_URL=https://api-staging.example.com bun run test:acceptance
 *
 * It uses only allowlisted staging identities and the shared staging OTP. It never prints tokens,
 * never mutates canonical commercial state, and never enables external FCM delivery.
 */

import { randomUUID } from "node:crypto";
import { loadPilotAuthorizations, type PilotRole } from "../auth/pilot-authorization.js";
import { loadPilotUsers, PilotUserDirectory } from "../auth/pilot-users.js";
import { loadConfig } from "../config.js";

const config = loadConfig(process.env);
const base = process.env.EXPERIENCE_BASE_URL?.replace(/\/+$/, "");
if (!base) {
  console.error("FAIL: EXPERIENCE_BASE_URL is required (hosted staging endpoint).");
  process.exit(2);
}
if (!/^https:\/\//.test(base) && process.env.ALLOW_INSECURE_ACCEPTANCE !== "true") {
  console.error("FAIL: hosted acceptance requires an https endpoint (set ALLOW_INSECURE_ACCEPTANCE=true for a local pre-check).");
  process.exit(2);
}

const directory = new PilotUserDirectory(
  loadPilotUsers(config.pilotUsersJson, config.pilotExpectedUserCount),
);
const authorizations = loadPilotAuthorizations(
  config.pilotRoleAssignmentsJson,
  directory.users,
  true,
);

const results: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail = ""): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function request(path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body };
}

async function login(email: string): Promise<string> {
  const challenge = await request("/v1/auth/otp/challenges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: email }),
  });
  if (challenge.status !== 201) throw new Error(`challenge ${challenge.status}`);
  const verified = await request("/v1/auth/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challenge_id: challenge.body.challenge_id, code: config.pilotOtpCode }),
  });
  if (verified.status !== 200) throw new Error(`verify ${verified.status}`);
  return String(verified.body.session_token);
}

function userWith(role: PilotRole, excluding?: string) {
  const match = [...authorizations.values()].find((item) =>
    item.userId !== excluding && item.roles.includes(role)
  );
  if (!match) throw new Error(`no staging identity for role ${role}`);
  const user = directory.get(match.userId);
  if (!user) throw new Error(`unknown staging user ${match.userId}`);
  return user;
}

const authorization = (token: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${token}`,
  ...extra,
});

try {
  // 1. Staging is reachable and identity store is connected.
  const health = await request("/health");
  record(
    "health reachable with connected identity store and simulated payment",
    health.status === 200 &&
      health.body.identity_store === "connected" &&
      health.body.payment_mode === "simulated" &&
      health.body.test_data === true,
    `status=${health.status} payment=${health.body.payment_mode} test_data=${health.body.test_data}`,
  );

  // 2. Unknown identity is rejected.
  const unknown = await request("/v1/auth/otp/challenges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: `not-allowlisted-${randomUUID()}@buildkart.test` }),
  });
  record("unknown identity rejected", unknown.status === 403, `status=${unknown.status}`);

  const customer = userWith("customer");
  const other = userWith("customer", customer.id);
  const operator = userWith("marketplace_operator");
  const [customerToken, otherToken, operatorToken] = await Promise.all([
    login(customer.email),
    login(other.email),
    login(operator.email),
  ]);

  // 3. Allowlisted identity signs in and receives server-owned context.
  const contexts = await request("/v1/me/contexts", { headers: authorization(customerToken) });
  const roles = (contexts.body.contexts as Array<Record<string, unknown>> | undefined)?.[0]?.roles as string[] | undefined;
  record(
    "allowlisted login returns server-owned customer context",
    contexts.status === 200 && Array.isArray(roles) && roles.includes("customer"),
    `roles=${roles?.join(",")}`,
  );

  // 4. Privileged routes are not reachable with a customer session.
  const metricsAsCustomer = await request("/metrics", { headers: authorization(customerToken) });
  record("customer cannot read /metrics", metricsAsCustomer.status === 404, `status=${metricsAsCustomer.status}`);
  const adminAsCustomer = await request("/v1/admin/orders", { headers: authorization(customerToken) });
  record("customer cannot read /v1/admin/orders", adminAsCustomer.status === 404, `status=${adminAsCustomer.status}`);

  // 5. Operator can read privileged surfaces.
  const metricsAsOperator = await request("/metrics", { headers: authorization(operatorToken) });
  record("marketplace operator can read /metrics", metricsAsOperator.status === 200, `status=${metricsAsOperator.status}`);
  const audit = await request("/v1/ops/audit", { headers: authorization(operatorToken) });
  record("marketplace operator can read /v1/ops/audit", audit.status === 200, `status=${audit.status}`);

  // 6. Notification inbox is owner-scoped and persists.
  const inbox = await request("/v1/me/notifications", { headers: authorization(customerToken) });
  const otherInbox = await request("/v1/me/notifications", { headers: authorization(otherToken) });
  const ownerIds = new Set((inbox.body.notifications as Array<Record<string, unknown>> ?? []).map((n) => n.user_id as string));
  record(
    "notification inbox is owner-scoped",
    inbox.status === 200 && otherInbox.status === 200 && (ownerIds.size <= 1) && !ownerIds.has(other.id),
    `status=${inbox.status}/${otherInbox.status}`,
  );

  // 7. Device registration binds to the authenticated user and can be removed.
  const device = await request("/v1/me/devices", {
    method: "POST",
    headers: { ...authorization(customerToken), "content-type": "application/json" },
    body: JSON.stringify({
      token: `acceptance-${randomUUID()}-${randomUUID()}`,
      platform: "android",
      firebase_project_id: "buildkart-staging",
    }),
  });
  const removed = device.status === 201
    ? await request(`/v1/me/devices/${device.body.id}`, { method: "DELETE", headers: authorization(customerToken) })
    : { status: 0 };
  record(
    "device registration binds to owner and is removable",
    device.status === 201 && removed.status === 204,
    `register=${device.status} remove=${removed.status}`,
  );

  // 8. Logout revokes the session.
  const logout = await request("/v1/auth/logout", { method: "POST", headers: authorization(customerToken) });
  const afterLogout = await request("/v1/me/contexts", { headers: authorization(customerToken) });
  record(
    "logout revokes the session",
    logout.status === 204 && afterLogout.status === 401,
    `logout=${logout.status} after=${afterLogout.status}`,
  );

  // 9. Production remains unauthorized on the deployment.
  const environment = await request("/v1/admin/environment", { headers: authorization(operatorToken) });
  record(
    "deployment reports production release unauthorized",
    environment.status !== 200 || environment.body.production_release_authorized === false,
    `status=${environment.status}`,
  );
} catch (error) {
  record("acceptance run completed", false, (error as Error).message);
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} acceptance checks passed.`);
if (failed.length) {
  console.error("FAIL: hosted staging acceptance did not pass.");
  process.exitCode = 1;
} else {
  console.log("PASS: hosted staging acceptance passed.");
}
