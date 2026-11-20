import assert from "node:assert/strict";
import {
  CloudflareAccessGroupSync,
  type AccessGroupInclude,
  type OpsSyncPerson,
} from "../auth/ops-cloudflare-sync.js";

/**
 * Unit test for the Cloudflare Access group sync. The fake fetch stores two groups and applies the
 * real PUT payloads, so membership changes and preservation rules are exercised without the network.
 */

interface FakeGroup {
  id: string;
  name: string;
  include: AccessGroupInclude[];
  exclude: AccessGroupInclude[];
  require: AccessGroupInclude[];
}

const state: Record<string, FakeGroup> = {
  staff: {
    id: "staff",
    name: "BazarBee Staff",
    include: [
      { email_domain: { domain: "gobazarbee.com" } },
      { email: { email: "owner@example.com" } },
      { email: { email: "manual@example.com" } },
    ],
    exclude: [],
    require: [],
  },
  erp: {
    id: "erp",
    name: "BazarBee ERP",
    include: [{ email: { email: "finance@example.com" } }],
    exclude: [],
    require: [],
  },
};

let failNext = false;
let putCount = 0;

const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const parts = url.pathname.split("/");
  const groupId = parts[parts.length - 1];
  if (failNext) {
    failNext = false;
    return new Response(JSON.stringify({ success: false, errors: [{ message: "boom" }] }), {
      status: 500,
    });
  }
  if (init?.method === "GET" && state[groupId]) {
    return new Response(JSON.stringify({ success: true, result: structuredClone(state[groupId]) }), {
      status: 200,
    });
  }
  if (init?.method === "PUT" && state[groupId]) {
    putCount += 1;
    const payload = JSON.parse(String(init.body)) as Partial<FakeGroup>;
    state[groupId] = {
      ...state[groupId],
      include: payload.include ?? state[groupId].include,
      exclude: payload.exclude ?? [],
      require: payload.require ?? [],
    };
    return new Response(JSON.stringify({ success: true, result: state[groupId] }), { status: 200 });
  }
  return new Response(JSON.stringify({ success: false, errors: [{ message: "not found" }] }), {
    status: 404,
  });
}) as unknown as typeof fetch;

const sync = new CloudflareAccessGroupSync({
  accountId: "acct",
  apiToken: "token",
  staffGroupId: "staff",
  erpGroupId: "erp",
  fetchImpl: fakeFetch,
  log: () => undefined,
});

const emails = (groupId: string): string[] =>
  state[groupId].include
    .map((entry) => (entry.email as { email?: string } | undefined)?.email ?? "")
    .filter(Boolean)
    .sort();

const person = (
  email: string,
  roles: string[],
  status: OpsSyncPerson["status"],
): OpsSyncPerson => ({ email, roles, status });

assert.deepEqual(sync.desiredGroupIds(person("a@x", ["support_operator"], "active")), ["staff"]);
assert.deepEqual(sync.desiredGroupIds(person("a@x", ["finance_operator"], "active")), ["erp"]);
assert.deepEqual(
  sync.desiredGroupIds(person("a@x", ["super_admin", "erp_operator"], "invited")),
  ["staff", "erp"],
);
assert.deepEqual(sync.desiredGroupIds(person("a@x", ["super_admin"], "disabled")), []);
console.log("PASS desired group mapping");

let result = await sync.syncUser(person("new@example.com", ["support_operator"], "active"));
assert.equal(result.ok, true);
assert.deepEqual(result.changed, ["staff"]);
assert.ok(emails("staff").includes("new@example.com"));
console.log("PASS invite adds the email to the Staff group");

result = await sync.syncUser(person("fin@example.com", ["finance_operator"], "active"));
assert.equal(result.ok, true);
assert.ok(emails("erp").includes("fin@example.com"));
console.log("PASS finance role adds the email to the ERP group");

result = await sync.syncUser(person("fin@example.com", ["support_operator"], "active"));
assert.equal(result.ok, true);
assert.deepEqual(result.changed.sort(), ["erp", "staff"]);
assert.ok(emails("staff").includes("fin@example.com"));
assert.equal(emails("erp").includes("fin@example.com"), false);
console.log("PASS role change moves the email between groups");

result = await sync.syncUser(person("fin@example.com", ["support_operator"], "disabled"));
assert.equal(result.ok, true);
assert.equal(emails("staff").includes("fin@example.com"), false);
console.log("PASS disable removes the email from the managed groups");

state.staff.include.push({ email: { email: "gone@example.com" } });
result = await sync.reconcile([
  person("owner@example.com", ["super_admin"], "active"),
  person("invited@example.com", ["support_operator"], "invited"),
  person("gone@example.com", ["support_operator"], "disabled"),
]);
assert.equal(result.ok, true);
assert.ok(emails("staff").includes("invited@example.com"));
assert.equal(emails("staff").includes("gone@example.com"), false);
assert.ok(
  state.staff.include.some((entry) => Boolean((entry.email_domain as { domain?: string })?.domain)),
  "domain rule is preserved",
);
assert.ok(emails("staff").includes("manual@example.com"), "unrelated email is preserved");
console.log("PASS reconcile adds, removes and preserves domain/foreign entries");

failNext = true;
const before = JSON.stringify(state);
result = await sync.syncUser(person("failing@example.com", ["support_operator"], "active"));
assert.equal(result.ok, false);
assert.ok(result.errors.length > 0);
assert.equal(JSON.stringify(state), before, "a failed sync leaves the group unchanged");
console.log("PASS API failure is reported and does not mutate local state");

assert.ok(putCount >= 4);
console.log("ALL OPS CLOUDFLARE SYNC CHECKS PASSED");
