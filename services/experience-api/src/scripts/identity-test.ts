import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PilotAuthStore } from "../auth/dummy-otp.js";
import { loadPilotUsers, PilotUserDirectory } from "../auth/pilot-users.js";
import { loadConfig } from "../config.js";
import { CorrelationStore } from "../store/correlation-store.js";

const config = loadConfig(process.env);
const base = process.env.EXPERIENCE_BASE_URL ?? `http://localhost:${config.port}`;
const directory = new PilotUserDirectory(
  loadPilotUsers(config.pilotUsersJson, config.pilotExpectedUserCount),
);

async function request(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, unknown> : null };
}

async function login(identifier: string): Promise<string> {
  const challenge = await request("/v1/auth/otp/challenges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier }),
  });
  assert.equal(challenge.status, 201);
  assert.equal("code" in (challenge.body ?? {}), false, "challenge response must not expose the OTP");
  const verified = await request("/v1/auth/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challenge_id: challenge.body?.challenge_id, code: config.pilotOtpCode }),
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.body?.test_data, true);
  return String(verified.body?.session_token);
}

const correlation = new CorrelationStore(config.experienceDatabaseUrl);
const cleanup = new pg.Pool({ connectionString: config.experienceDatabaseUrl, max: 1 });
const checkoutRef = `identity-test-${randomUUID()}`;

try {
  assert.throws(
    () => loadPilotUsers(JSON.stringify([directory.users[0], directory.users[0]])),
    /Duplicate pilot identifier/,
  );
  assert.throws(
    () => loadConfig({ BUILDKART_ENVIRONMENT: "staging", PILOT_OTP_CODE: "12345" }),
    /six digits/,
  );

  const unknown = await request("/v1/auth/otp/challenges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "not-allowlisted@buildkart.test" }),
  });
  assert.equal(unknown.status, 403);

  assert.ok(directory.users.length >= 2, "identity isolation test requires at least two pilot users");
  const owner = directory.users[0];
  const other = directory.users[1];
  const ownerToken = await login(owner.email);
  const otherToken = await login(other.email);

  // Two stores using one Redis URL prove challenges/sessions are shared across replicas.
  const replicaA = new PilotAuthStore(
    config.redisUrl,
    config.pilotOtpCode,
    config.pilotChallengeTtlSeconds,
    config.pilotSessionTtlSeconds,
  );
  const replicaB = new PilotAuthStore(
    config.redisUrl,
    config.pilotOtpCode,
    config.pilotChallengeTtlSeconds,
    config.pilotSessionTtlSeconds,
  );
  const crossReplicaChallenge = await replicaA.issueChallenge(owner.id);
  const crossReplicaSession = await replicaB.verifyChallenge(
    crossReplicaChallenge.challenge_id,
    config.pilotOtpCode,
  );
  assert.ok(crossReplicaSession);
  assert.equal(await replicaA.resolveSession(crossReplicaSession.session_token), owner.id);
  await replicaB.revokeSession(crossReplicaSession.session_token);
  replicaA.close();
  replicaB.close();

  await correlation.link(checkoutRef, { ownerUserId: owner.id });
  const denied = await request(`/v1/orders/${checkoutRef}`, {
    headers: { authorization: `Bearer ${otherToken}` },
  });
  assert.equal(denied.status, 404, "another pilot user must not discover the owner's order");
  const allowed = await request(`/v1/orders/${checkoutRef}`, {
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body?.test_data, true);

  const logout = await request("/v1/auth/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(logout.status, 204);
  const afterLogout = await request(`/v1/orders/${checkoutRef}`, {
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(afterLogout.status, 401, "logout must revoke the session");

  console.log("PASS: configurable pilot identity, Redis sessions and order ownership isolation.");
  console.log("  unknown identity -> 403; cross-replica session -> resolved; logout -> revoked");
  console.log("  owner order read -> 200; other pilot user -> 404");
} catch (error) {
  console.error("FAIL: pilot identity and ownership check failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup.query("DELETE FROM correlation WHERE checkout_ref = $1", [checkoutRef]).catch(() => undefined);
  await cleanup.end();
  await correlation.close();
}
