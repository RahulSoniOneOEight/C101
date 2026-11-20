import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { OpsStaffStore } from "../auth/ops-staff.js";
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  otpauthUri,
  totpAt,
  totpStepAt,
  verifyTotp,
} from "../auth/ops-totp.js";

/**
 * Slice 1 test: TOTP primitives always; the staff store when EXPERIENCE_DATABASE_URL is present.
 * The store test creates one short-lived staff row and deletes it, including its audit trail.
 */

const references = [
  { time: 59, code: "287082" },
  { time: 1111111109, code: "081804" },
  { time: 1111111111, code: "050471" },
  { time: 1234567890, code: "005924" },
  { time: 2000000000, code: "279037" },
  { time: 20000000000, code: "353130" },
];
const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

for (const reference of references) {
  const step = Math.floor(reference.time / 30);
  assert.equal(totpAt(rfcSecret, step), reference.code, `RFC 6238 vector at ${reference.time}`);
  assert.deepEqual(verifyTotp(rfcSecret, reference.code, null, reference.time * 1000), {
    valid: true,
    step,
  });
}
console.log("PASS RFC 6238 SHA-1 vectors (6 digits)");

const generated = generateTotpSecret();
assert.equal(generated.length, 32);
const roundTrip = randomBytes(20);
assert.deepEqual(base32Decode(base32Encode(roundTrip)), roundTrip);
assert.throws(() => base32Decode("not-base32!"), /base32/);
console.log("PASS base32 round trip and validation");

const step = totpStepAt(1_700_000_000_000);
const code = totpAt(generated, step);
assert.equal(verifyTotp(generated, code, null, 1_700_000_000_000).valid, true);
assert.deepEqual(verifyTotp(generated, code, step, 1_700_000_000_000), {
  valid: false,
  reason: "replay",
});
assert.equal(verifyTotp(generated, "12345", null, 1_700_000_000_000).valid, false);
assert.equal(verifyTotp(generated, "abcdef", null, 1_700_000_000_000).valid, false);
const driftCode = totpAt(generated, step + 1);
assert.equal(verifyTotp(generated, driftCode, null, 1_700_000_000_000).valid, true);
console.log("PASS replay, format and one-step drift");

const uri = otpauthUri(generated, "ops.person@example.com");
assert.ok(uri.startsWith("otpauth://totp/BazarBee%3Aops.person%40example.com?"));
assert.ok(uri.includes(`secret=${generated}`));
assert.ok(uri.includes("digits=6"));
console.log("PASS otpauth URI");

const codes = generateRecoveryCodes();
assert.equal(codes.length, 10);
assert.equal(new Set(codes).size, 10);
assert.equal(normalizeRecoveryCode(codes[0]), codes[0].replace("-", ""));
assert.equal(
  hashRecoveryCode(codes[0]),
  hashRecoveryCode(codes[0].toUpperCase().replace("-", " ")),
);
console.log("PASS recovery code generation and hashing");

const databaseUrl = process.env.EXPERIENCE_DATABASE_URL;
if (!databaseUrl) {
  console.log("SKIP store tests: EXPERIENCE_DATABASE_URL is not set");
  process.exit(0);
}

const store = new OpsStaffStore(databaseUrl, randomBytes(32));
const cleanup = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const email = `ops-test-${randomUUID()}@buildkart.test`;
const actor = "ops-test-superadmin@buildkart.test";

try {
  const created = await store.create({
    email: email.toUpperCase(),
    name: "Ops Test",
    roles: ["support_operator"],
    actorEmail: actor,
    reason: "slice 1 store test",
  });
  assert.equal(created.email, email.toLowerCase());
  assert.equal(created.status, "invited");
  assert.deepEqual(created.roles, ["support_operator"]);
  assert.equal(created.totpEnrolled, false);
  console.log("PASS create invited staff");

  assert.equal(await store.beginEnrollment(email, generated), true);
  const enrolled = await store.confirmEnrollment(email, codes);
  assert.ok(enrolled);
  assert.equal(enrolled?.status, "active");
  assert.equal(enrolled?.totpEnrolled, true);
  assert.equal(enrolled?.recoveryCodesRemaining, 10);
  assert.equal(await store.getTotpSecret(email), generated);
  console.log("PASS enrollment activates staff and stores the secret encrypted");

  const accepted = await store.consumeTotpStep(email, step);
  assert.equal(accepted, true);
  assert.equal(await store.consumeTotpStep(email, step), false);
  console.log("PASS TOTP step is single-use");

  assert.equal(await store.consumeRecoveryCode(email, codes[0]), true);
  assert.equal(await store.consumeRecoveryCode(email, codes[0]), false);
  const afterRecovery = await store.get(email);
  assert.equal(afterRecovery?.recoveryCodesRemaining, 9);
  console.log("PASS recovery code is single-use");

  const listed = await store.list();
  assert.ok(listed.some((person) => person.email === email), "list includes the staff user");
  await assert.rejects(
    () =>
      store.create({
        email,
        name: "Duplicate",
        roles: ["support_operator"],
        actorEmail: actor,
        reason: "duplicate test",
      }),
    /already exists/,
  );
  console.log("PASS list and duplicate protection");

  const reset = await store.resetEnrollment(email, actor, "reset test");
  assert.equal(reset?.status, "invited");
  assert.equal(reset?.totpEnrolled, false);
  assert.equal(reset?.recoveryCodesRemaining, 0);
  assert.equal(await store.getTotpSecret(email), null);
  assert.equal(await store.beginEnrollment(email, generated), true);
  const reenrolled = await store.confirmEnrollment(email, generateRecoveryCodes());
  assert.equal(reenrolled?.status, "active");
  assert.equal(reenrolled?.totpEnrolled, true);
  console.log("PASS TOTP reset clears the secret and allows re-enrolment");

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const failure = await store.registerFailure(email);
    assert.equal(failure.failedAttempts, attempt);
    if (attempt === 5) assert.ok(failure.lockedUntil, "fifth failure locks the account");
  }
  console.log("PASS five failures lock the account");

  const rerolled = await store.setRoles(
    email,
    ["marketplace_operator", "support_operator"],
    actor,
    "role change test",
  );
  assert.deepEqual(rerolled?.roles, ["marketplace_operator", "support_operator"]);

  const disabled = await store.setStatus(email, "disabled", actor, "disable test");
  assert.equal(disabled?.status, "disabled");
  assert.ok(disabled?.disabledAt);

  const audit = await store.auditTrail(email);
  assert.ok(audit.length >= 6, `expected audit rows, got ${audit.length}`);
  console.log("PASS role change, disable and audit trail");
} finally {
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

console.log("ALL OPS STAFF SLICE 1 CHECKS PASSED");
