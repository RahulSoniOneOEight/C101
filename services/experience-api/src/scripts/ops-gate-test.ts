import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign as cryptoSign } from "node:crypto";
import { AccessJwtVerifier } from "../auth/ops-access-jwt.js";
import { OpsGate, readCookie } from "../auth/ops-gate.js";
import { OpsSessionStore } from "../auth/ops-session.js";
import type { OpsStaff } from "../auth/ops-staff.js";

/**
 * Slice 2 test: Access JWT verification, gate decisions in enforce and shadow modes, and the Redis
 * session store when REDIS_URL is present. No database is needed.
 */

const TEAM_DOMAIN = "bazarbee.cloudflareaccess.com";
const AUDIENCE = "test-audience";
const NOW = 1_800_000_000_000;

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as { kty: string; n: string; e: string };
const jwks = {
  keys: [{ ...jwk, kid: "test-kid", alg: "RS256", use: "sig" }],
};

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function token(
  overrides: Record<string, unknown> = {},
  header: Record<string, unknown> = { alg: "RS256", typ: "JWT", kid: "test-kid" },
): string {
  const payload = {
    email: "Ops.Person@Example.com",
    aud: AUDIENCE,
    iss: `https://${TEAM_DOMAIN}`,
    sub: "user-1",
    iat: Math.floor(NOW / 1000),
    exp: Math.floor(NOW / 1000) + 600,
    ...overrides,
  };
  const signingInput = `${b64(header)}.${b64(payload)}`;
  const signature = cryptoSign("sha256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
}

const verifier = new AccessJwtVerifier({
  teamDomain: TEAM_DOMAIN,
  audience: AUDIENCE,
  jwks,
  now: () => NOW,
});

const valid = await verifier.verify(token());
assert.equal(valid.ok, true);
if (valid.ok) {
  assert.equal(valid.claims.email, "ops.person@example.com");
  assert.equal(valid.claims.sub, "user-1");
}
assert.deepEqual(
  await verifier.verify(token({ aud: "someone-else" })),
  { ok: false, reason: "wrong-audience" },
);
assert.deepEqual(
  await verifier.verify(token({ exp: Math.floor(NOW / 1000) - 1 })),
  { ok: false, reason: "expired" },
);
assert.deepEqual(await verifier.verify(null), { ok: false, reason: "missing" });
assert.deepEqual(await verifier.verify("not-a-jwt"), { ok: false, reason: "malformed" });
assert.deepEqual(
  await verifier.verify(token({}, { alg: "RS256", typ: "JWT", kid: "other-kid" })),
  { ok: false, reason: "unknown-key", detail: "other-kid" },
);
const tampered = token();
const [headerPart, , signaturePart] = tampered.split(".");
const tamperedPayload = b64({
  email: "attacker@example.com",
  aud: AUDIENCE,
  iss: `https://${TEAM_DOMAIN}`,
  exp: Math.floor(NOW / 1000) + 600,
});
assert.deepEqual(await verifier.verify(`${headerPart}.${tamperedPayload}.${signaturePart}`), {
  ok: false,
  reason: "bad-signature",
});
console.log("PASS Access JWT verification and failure modes");

const staff: OpsStaff = {
  id: "ops_test",
  email: "ops.person@example.com",
  name: "Ops Person",
  roles: ["support_operator"],
  status: "active",
  totpEnrolled: true,
  totpConfirmedAt: new Date(NOW).toISOString(),
  recoveryCodesRemaining: 10,
  failedAttempts: 0,
  lockedUntil: null,
  createdBy: "super@example.com",
  createdAt: new Date(NOW).toISOString(),
  lastLoginAt: null,
  disabledAt: null,
  disabledBy: null,
};

const sessions = {
  resolveSession: async (token: string | null) =>
    token === "good-session"
      ? {
          email: staff.email,
          name: staff.name,
          roles: staff.roles,
          accessSub: "user-1",
          totpAt: new Date(NOW).toISOString(),
          createdAt: new Date(NOW).toISOString(),
        }
      : null,
};
const claims = {
  email: staff.email,
  sub: "user-1",
  aud: AUDIENCE,
  iss: `https://${TEAM_DOMAIN}`,
  exp: Math.floor(NOW / 1000) + 600,
  iat: Math.floor(NOW / 1000),
  nbf: null,
};
const verifierStub = {
  verify: async (value: string | null) =>
    value === "good-jwt" ? { ok: true as const, claims } : { ok: false as const, reason: "missing" as const },
};

function gate(
  mode: "off" | "shadow" | "enforce",
  current: OpsStaff | null,
  resolveSession = sessions.resolveSession,
) {
  return new OpsGate({
    mode,
    staff: { get: async () => current } as never,
    sessions: { resolveSession } as never,
    verifier: verifierStub as never,
    now: () => NOW,
    log: () => undefined,
  });
}

assert.deepEqual(await gate("off", null).evaluate({ accessJwt: null, sessionToken: null }), {
  status: 204,
  reason: "gate-off",
});
assert.equal(
  (await gate("enforce", staff).evaluate({ accessJwt: null, sessionToken: null })).status,
  401,
);
assert.equal(
  (await gate("enforce", null).evaluate({ accessJwt: "good-jwt", sessionToken: null })).status,
  403,
);
assert.equal(
  (
    await gate("enforce", { ...staff, status: "disabled" }).evaluate({
      accessJwt: "good-jwt",
      sessionToken: null,
    })
  ).status,
  403,
);
assert.equal(
  (
    await gate("enforce", { ...staff, lockedUntil: new Date(NOW + 60_000).toISOString() }).evaluate({
      accessJwt: "good-jwt",
      sessionToken: null,
    })
  ).status,
  423,
);
const enrolledDecision = await gate("enforce", { ...staff, totpEnrolled: false }).evaluate({
  accessJwt: "good-jwt",
  sessionToken: null,
});
assert.equal(enrolledDecision.status, 401);
assert.equal(enrolledDecision.next, "/ops/enroll");
const loginDecision = await gate("enforce", staff).evaluate({
  accessJwt: "good-jwt",
  sessionToken: "bad-session",
});
assert.equal(loginDecision.status, 401);
assert.equal(loginDecision.next, "/ops/login");
assert.deepEqual(
  await gate("enforce", staff).evaluate({ accessJwt: "good-jwt", sessionToken: "good-session" }),
  { status: 204, reason: "allowed" },
);
const shadowDecision = await gate("shadow", staff).evaluate({
  accessJwt: "good-jwt",
  sessionToken: "bad-session",
});
assert.equal(shadowDecision.status, 204);
assert.equal(shadowDecision.shadow?.wouldBeStatus, 401);
assert.equal(shadowDecision.shadow?.wouldBeNext, "/ops/login");
console.log("PASS gate decisions: off, enforce, shadow, enrolment, login, disabled and lock");

assert.equal(readCookie("a=1; bz_ops_session=abc; c=2", "bz_ops_session"), "abc");
assert.equal(readCookie("a=1", "bz_ops_session"), null);
assert.equal(readCookie(null, "bz_ops_session"), null);
console.log("PASS session cookie parsing");

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.log("SKIP session store test: REDIS_URL is not set");
  process.exit(0);
}

const store = new OpsSessionStore(redisUrl, `bazarbee:ops-test:${randomUUID()}`, 60);
const issued = await store.issueSession({
  email: staff.email,
  name: staff.name,
  roles: staff.roles,
  accessSub: "user-1",
  totpAt: new Date(NOW).toISOString(),
});
assert.equal(issued.expires_in_seconds, 60);
const resolved = await store.resolveSession(issued.session_token);
assert.equal(resolved?.email, staff.email);
assert.deepEqual(resolved?.roles, staff.roles);
assert.equal(await store.revokeSession(issued.session_token), true);
assert.equal(await store.resolveSession(issued.session_token), null);
assert.equal(await store.resolveSession("not-a-token"), null);
console.log("PASS Redis ops session issue, resolve and revoke");

console.log("ALL OPS GATE SLICE 2 CHECKS PASSED");
