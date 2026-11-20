import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  issueFormToken,
  opsEnrollPage,
  opsLoginPage,
  opsNoticePage,
  opsRecoveryPage,
  verifyFormToken,
} from "../auth/ops-pages.js";

const key = randomBytes(32);
const now = 1_800_000_000_000;
const email = "ops.person@example.com";

const token = issueFormToken(email, key, now);
assert.equal(verifyFormToken(token, email, key, now), true);
assert.equal(verifyFormToken(token, "other@example.com", key, now), false);
assert.equal(verifyFormToken(token, email, randomBytes(32), now), false);
assert.equal(verifyFormToken(token, email, key, now + 11 * 60 * 1000), false);

const [expires, mac] = token.split(".");
const tampered = `${expires}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`;
assert.equal(verifyFormToken(tampered, email, key, now), false);
assert.equal(verifyFormToken("", email, key, now), false);
assert.equal(verifyFormToken("not-a-token", email, key, now), false);
console.log("PASS form token issue, expiry, wrong identity and tamper");

const login = opsLoginPage({ email, csrf: token, next: "/dashboard" });
assert.ok(login.includes('name="csrf"'));
assert.ok(login.includes('action="/v1/ops/totp/verify"'));
assert.ok(login.includes('autocomplete="one-time-code"'));
assert.ok(login.includes(email));
assert.ok(login.includes("Cloudflare Access"));

const escaped = opsLoginPage({
  email: '<script>alert(1)</script>@example.com',
  csrf: token,
  next: "/dashboard",
});
assert.equal(escaped.includes("<script>alert(1)</script>"), false);
assert.ok(escaped.includes("&lt;script&gt;"));
console.log("PASS login page renders and escapes identity");

const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const enroll = opsEnrollPage({
  email,
  csrf: token,
  secret,
  uri: `otpauth://totp/BazarBee:${email}?secret=${secret}`,
});
assert.ok(enroll.includes('action="/v1/ops/totp/enroll"'));
assert.ok(enroll.includes("JBSW Y3DP EHPK 3PXP"));
assert.ok(enroll.includes("otpauth://totp/"));
console.log("PASS enrolment page renders the grouped secret and form");

const recovery = opsRecoveryPage({ codes: ["abcde-12345", "fghij-67890"] });
assert.ok(recovery.includes("abcde-12345"));
assert.ok(recovery.includes("fghij-67890"));
assert.ok(recovery.includes("/ops/login"));
console.log("PASS recovery page renders once-only codes");

const notice = opsNoticePage({
  title: "No access",
  message: "This account is not on the ops staff list.",
  link: { href: "/ops/login", label: "Try again" },
});
assert.ok(notice.includes("No access"));
assert.ok(notice.includes('href="/ops/login"'));
console.log("PASS notice page");

console.log("ALL OPS PAGES SLICE 3 CHECKS PASSED");
