import assert from "node:assert/strict";
import type { OpsStaff, OpsStaffRequest } from "../auth/ops-staff.js";
import { opsStaffAuditPage, opsStaffPage } from "../auth/ops-pages.js";

const now = "2026-11-21T00:00:00.000Z";

const staff: OpsStaff[] = [
  {
    id: "ops_1",
    email: "owner@example.com",
    name: "Owner",
    roles: ["super_admin", "marketplace_operator"],
    status: "active",
    totpEnrolled: true,
    totpConfirmedAt: now,
    recoveryCodesRemaining: 8,
    failedAttempts: 0,
    lockedUntil: null,
    createdBy: "bootstrap",
    createdAt: now,
    lastLoginAt: now,
    disabledAt: null,
    disabledBy: null,
  },
  {
    id: "ops_2",
    email: "finance@example.com",
    name: "<script>alert(1)</script>",
    roles: ["finance_operator"],
    status: "invited",
    totpEnrolled: false,
    totpConfirmedAt: null,
    recoveryCodesRemaining: 0,
    failedAttempts: 0,
    lockedUntil: null,
    createdBy: "owner@example.com",
    createdAt: now,
    lastLoginAt: null,
    disabledAt: null,
    disabledBy: null,
  },
];

const requests: OpsStaffRequest[] = [
  {
    id: "req_own",
    action: "create",
    targetEmail: "newlead@example.com",
    payload: { roles: ["super_admin"] },
    reason: "new ops lead",
    requestedBy: "owner@example.com",
    requestedAt: now,
    expiresAt: now,
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    error: null,
  },
  {
    id: "req_other",
    action: "roles",
    targetEmail: "finance@example.com",
    payload: { roles: ["finance_operator", "erp_operator"] },
    reason: "add ERP access",
    requestedBy: "other-superadmin@example.com",
    requestedAt: now,
    expiresAt: now,
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    error: null,
  },
];

const page = opsStaffPage({
  actorEmail: "owner@example.com",
  staff,
  requests,
  csrf: "csrf-token",
  message: "Invited finance@example.com",
});
assert.ok(page.includes("Staff directory"));
assert.ok(page.includes("owner@example.com"));
assert.ok(page.includes("finance@example.com"));
assert.ok(page.includes("super_admin"));
assert.ok(page.includes("finance_operator"));
assert.ok(page.includes('value="csrf-token"'));
assert.ok(page.includes('action="/ops/staff"'));
assert.ok(page.includes("Invite staff"));
assert.ok(page.includes("/v1/ops/staff/export.csv"));
assert.ok(page.includes("/ops/staff/audit?email=finance%40example.com"));
assert.equal(page.includes("<script>alert(1)</script>"), false);
assert.ok(page.includes("&lt;script&gt;"));
assert.ok(page.includes("enrolled"));
assert.ok(page.includes("not enrolled"));
assert.ok(page.includes("Invited finance@example.com"));
assert.ok(page.includes("Pending second approval"));
assert.ok(page.includes("newlead@example.com"));
assert.ok(page.includes("Awaiting another active superadmin."));
assert.ok(page.includes('action="/ops/staff/approvals"'));
assert.ok(page.includes('value="approved"'));
assert.ok(page.includes('value="rejected"'));
assert.ok(page.includes("add ERP access"));
console.log("PASS staff page renders people, roles, approval requests, forms and escapes names");

const invitedPage = opsStaffPage({
  actorEmail: "owner@example.com",
  staff,
  requests: [],
  csrf: "csrf-token",
  inviteEmail: "new@example.com",
  inviteUrl: "https://ops-staging.pinakaplay.cloud/dashboard/invite?token=abc123",
});
assert.ok(invitedPage.includes("Mercur invite for new@example.com"));
assert.ok(invitedPage.includes("dashboard/invite?token=abc123"));
assert.ok(invitedPage.includes("Copy link"));
console.log("PASS staff page renders the Mercur set-password link");

const audit = opsStaffAuditPage({
  actorEmail: "owner@example.com",
  targetEmail: "finance@example.com",
  rows: [
    {
      at: now,
      actor_email: "owner@example.com",
      action: "staff.created",
      reason: "new finance user",
      before: null,
      after: { roles: ["finance_operator"] },
    },
    {
      at: now,
      actor_email: "owner@example.com",
      action: "staff.roles_changed",
      reason: "<script>alert(2)</script>",
      before: { roles: ["support_operator"] },
      after: { roles: ["finance_operator"] },
    },
  ],
});
assert.ok(audit.includes("staff.created"));
assert.ok(audit.includes("staff.roles_changed"));
assert.ok(audit.includes("new finance user"));
assert.equal(audit.includes("<script>alert(2)</script>"), false);
assert.ok(audit.includes("&lt;script&gt;"));
console.log("PASS audit page renders actions, reasons and escapes input");

console.log("ALL OPS STAFF PAGE CHECKS PASSED");
