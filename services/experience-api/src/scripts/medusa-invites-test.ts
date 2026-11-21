import assert from "node:assert/strict";
import { MedusaAdminInvites } from "../auth/medusa-invites.js";

/** Unit test with a fake Medusa admin API. No network or credentials are used. */

function jwt(expSecondsFromNow: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }),
  ).toString("base64url");
  return `${header}.${payload}.signature`;
}

let loginCount = 0;
let createCount = 0;
let rejectNextCreate = false;

const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith("/auth/user/emailpass")) {
    loginCount += 1;
    return new Response(JSON.stringify({ token: jwt(3600) }), { status: 200 });
  }
  if (url.endsWith("/admin/invites")) {
    createCount += 1;
    if (rejectNextCreate) {
      rejectNextCreate = false;
      return new Response("unauthorized", { status: 401 });
    }
    const body = JSON.parse(String(init?.body)) as { email: string };
    return new Response(
      JSON.stringify({
        invite: { id: `inv_${createCount}`, email: body.email, token: `token_${createCount}` },
      }),
      { status: 200 },
    );
  }
  return new Response("not found", { status: 404 });
}) as unknown as typeof fetch;

const invites = new MedusaAdminInvites({
  baseUrl: "http://medusa-api:9010",
  email: "admin@buildkart.test",
  password: "secret",
  adminBaseUrl: "https://ops-staging.pinakaplay.cloud",
  fetchImpl: fakeFetch,
});

const first = await invites.createInvite("new@example.com");
assert.equal(first.id, "inv_1");
assert.equal(first.email, "new@example.com");
assert.equal(
  first.url,
  "https://ops-staging.pinakaplay.cloud/dashboard/invite?token=token_1",
);
assert.equal(loginCount, 1, "login token is cached");

const second = await invites.createInvite("second@example.com");
assert.equal(second.id, "inv_2");
assert.equal(loginCount, 1, "second invite reuses the cached token");
console.log("PASS invite creation, URL construction and token cache");

rejectNextCreate = true;
const retried = await invites.createInvite("retry@example.com");
assert.equal(retried.id, "inv_4");
assert.equal(loginCount, 2, "401 refreshes the admin token once");
console.log("PASS 401 refreshes the admin token and retries");

const failing = new MedusaAdminInvites({
  baseUrl: "http://medusa-api:9010",
  email: "admin@buildkart.test",
  password: "wrong",
  adminBaseUrl: "https://ops-staging.pinakaplay.cloud",
  fetchImpl: (async () => new Response("bad credentials", { status: 401 })) as unknown as typeof fetch,
});
await assert.rejects(() => failing.createInvite("x@example.com"), /login failed/);
console.log("PASS login failure is reported");

console.log("ALL MEDUSA INVITE CHECKS PASSED");
