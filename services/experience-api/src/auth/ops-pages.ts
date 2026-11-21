import { createHmac, timingSafeEqual } from "node:crypto";
import { OPS_STAFF_ROLES, type OpsStaff, type OpsStaffRequest } from "./ops-staff.js";

/**
 * Server-rendered ops identity pages.
 *
 * Every form carries a short-lived HMAC token bound to the Cloudflare-verified email. The pages are
 * intentionally dependency-free so they work behind Access without a separate frontend build.
 */

const FORM_TTL_SECONDS = 10 * 60;

export function issueFormToken(email: string, key: Buffer, nowMs = Date.now()): string {
  const expires = Math.floor(nowMs / 1000) + FORM_TTL_SECONDS;
  const mac = createHmac("sha256", key)
    .update(`ops-form:${email}:${expires}`)
    .digest("base64url");
  return `${expires}.${mac}`;
}

export function verifyFormToken(
  token: string,
  email: string,
  key: Buffer,
  nowMs = Date.now(),
): boolean {
  const [expiresRaw, mac] = token.split(".");
  const expires = Number(expiresRaw);
  if (!Number.isInteger(expires) || expires * 1000 < nowMs || !mac) return false;
  const expected = createHmac("sha256", key)
    .update(`ops-form:${email}:${expires}`)
    .digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function layout(title: string, body: string, options: { wide?: boolean } = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)} · BazarBee Ops</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #f4f5f7; color: #111827;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: min(440px, calc(100% - 2rem)); margin: 7vh auto 4vh; background: #fff;
         border: 1px solid #e5e7eb; border-radius: 14px; padding: 26px 24px 22px;
         box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .brand { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.1rem; }
  .brand strong { font-size: .95rem; letter-spacing: .04em; text-transform: uppercase; }
  .badge { font-size: .7rem; color: #6b7280; border: 1px solid #e5e7eb; border-radius: 999px;
           padding: .15rem .5rem; }
  h1 { font-size: 1.2rem; margin: 0 0 .35rem; }
  p { color: #4b5563; font-size: .9rem; line-height: 1.5; margin: .4rem 0 .2rem; }
  label { display: block; font-size: .8rem; font-weight: 600; color: #374151;
          margin: 1.1rem 0 .35rem; }
  input { width: 100%; padding: .72rem .8rem; border: 1px solid #d1d5db; border-radius: 8px;
          font-size: 1rem; font-family: inherit; }
  input:focus { outline: 2px solid #111827; outline-offset: 1px; border-color: #111827; }
  button { width: 100%; margin-top: 1.1rem; padding: .78rem; border: 0; border-radius: 8px;
           background: #111827; color: #fff; font-size: .95rem; font-weight: 600; cursor: pointer; }
  button:hover { background: #1f2937; }
  .error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 8px;
           padding: .6rem .7rem; font-size: .85rem; margin: 1rem 0 0; }
  .notice { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
            padding: .7rem .8rem; font-size: .85rem; margin: 1rem 0 0; }
  .secret { display: block; margin-top: .5rem; padding: .7rem .8rem; background: #f3f4f6;
            border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: .82rem; word-break: break-all; }
  .codes { display: grid; grid-template-columns: 1fr 1fr; gap: .45rem; margin: 1rem 0 0;
           font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85rem; }
  .codes span { background: #f3f4f6; border-radius: 6px; padding: .4rem .5rem; text-align: center; }
  a { color: #111827; font-weight: 600; }
  .footer { margin-top: 1.4rem; font-size: .78rem; color: #6b7280; }
  main.wide { width: min(1060px, calc(100% - 2rem)); }
  table { width: 100%; border-collapse: collapse; font-size: .8rem; margin-top: 1rem; }
  th, td { text-align: left; padding: .55rem .45rem; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { color: #6b7280; font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; }
  .muted { color: #6b7280; font-size: .75rem; }
  .pill { display: inline-block; font-size: .68rem; border-radius: 999px; padding: .1rem .45rem;
          background: #f3f4f6; margin: 0 .15rem .15rem 0; }
  .pill.ok { background: #dcfce7; color: #166534; }
  .pill.warn { background: #fef3c7; color: #92400e; }
  .pill.off { background: #fee2e2; color: #991b1b; }
  details { margin-top: .3rem; }
  summary { cursor: pointer; font-size: .78rem; font-weight: 600; }
  .actions form { margin: .45rem 0; padding: .5rem; background: #f9fafb; border: 1px solid #e5e7eb;
                  border-radius: 8px; }
  .actions input[type=text], .actions select { padding: .35rem .45rem; font-size: .78rem; }
  .actions button { width: auto; margin-top: .4rem; padding: .38rem .65rem; font-size: .75rem; }
  .invite { margin-top: 1.2rem; padding: 1rem; border: 1px solid #e5e7eb; border-radius: 10px;
            background: #f9fafb; }
  .invite label { margin-top: .6rem; }
  .check { display: inline-flex; align-items: center; gap: .3rem; margin: .2rem .7rem .2rem 0;
           font-size: .8rem; }
  .check input { width: auto; }
  .banner { border-radius: 8px; padding: .6rem .75rem; font-size: .85rem; margin: 1rem 0 0; }
  .banner.ok { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
  .banner.err { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  .approval { border: 1px solid #e5e7eb; border-radius: 8px; padding: .65rem .75rem; margin: .6rem 0;
              background: #fff; }
  .approval .meta { font-size: .72rem; color: #6b7280; margin-top: .2rem; }
  .approval form { display: inline-flex; gap: .4rem; align-items: center; margin: .45rem .5rem 0 0; }
  .approval input[type=text] { width: 15rem; }
  .approval button { width: auto; margin-top: 0; padding: .38rem .65rem; font-size: .75rem; }
</style>
</head>
<body>
<main${options.wide ? ' class="wide"' : ""}>
  <div class="brand"><strong>BazarBee</strong><span class="badge">Ops · staging</span></div>
  ${body}
</main>
</body>
</html>`;
}

export function opsLoginPage(options: {
  email: string;
  csrf: string;
  next: string;
  error?: string;
}): string {
  return layout(
    "Sign in",
    `<h1>Authenticator code</h1>
     <p>Signed in as <strong>${escapeHtml(options.email)}</strong> through Cloudflare Access.
        Enter the six-digit code from your authenticator app.</p>
     ${options.error ? `<div class="error">${escapeHtml(options.error)}</div>` : ""}
     <form method="post" action="/v1/ops/totp/verify">
       <input type="hidden" name="csrf" value="${escapeHtml(options.csrf)}" />
       <input type="hidden" name="next" value="${escapeHtml(options.next)}" />
       <label for="code">Authenticator or recovery code</label>
       <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code"
              autofocus required />
       <button type="submit">Verify</button>
     </form>
     <div class="footer">Lost your device? Use one of the recovery codes you saved, or ask a
       superadmin to reset your enrolment.</div>`,
  );
}

export function opsEnrollPage(options: {
  email: string;
  csrf: string;
  secret: string;
  uri: string;
  error?: string;
}): string {
  const grouped = options.secret.replace(/(.{4})/g, "$1 ").trim();
  return layout(
    "Set up authenticator",
    `<h1>Set up your authenticator</h1>
     <p>Add this account to Google Authenticator, 1Password, Authy or any TOTP app. Then enter the
        six-digit code to finish.</p>
     ${options.error ? `<div class="error">${escapeHtml(options.error)}</div>` : ""}
     <label>Manual key</label>
     <code class="secret">${escapeHtml(grouped)}</code>
     <p style="margin-top:.7rem"><a href="${escapeHtml(options.uri)}">Open in an authenticator app</a></p>
     <form method="post" action="/v1/ops/totp/enroll">
       <input type="hidden" name="csrf" value="${escapeHtml(options.csrf)}" />
       <label for="code">Six-digit code</label>
       <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code"
              autofocus required />
       <button type="submit">Finish setup</button>
     </form>
     <div class="footer">Account: ${escapeHtml(options.email)}</div>`,
  );
}

export function opsRecoveryPage(options: { codes: string[] }): string {
  return layout(
    "Recovery codes",
    `<h1>Save your recovery codes</h1>
     <p>These are shown once. Each code works a single time if you lose your authenticator.</p>
     <div class="codes">${options.codes
       .map((code) => `<span>${escapeHtml(code)}</span>`)
       .join("")}</div>
     <p style="margin-top:1rem">Store them offline, then continue to sign in.</p>
     <p><a href="/ops/login">Continue to sign in</a></p>`,
  );
}

export function opsNoticePage(options: {
  title: string;
  message: string;
  link?: { href: string; label: string };
}): string {
  return layout(
    options.title,
    `<h1>${escapeHtml(options.title)}</h1>
     <p>${escapeHtml(options.message)}</p>
     ${options.link ? `<p style="margin-top:1rem"><a href="${escapeHtml(options.link.href)}">${escapeHtml(options.link.label)}</a></p>` : ""}`,
  );
}

function roleChecks(selected: readonly string[]): string {
  return OPS_STAFF_ROLES.map(
    (role) =>
      `<label class="check"><input type="checkbox" name="roles" value="${role}"${
        selected.includes(role) ? " checked" : ""
      } /> ${role}</label>`,
  ).join("");
}

function statusPill(status: OpsStaff["status"]): string {
  const className = status === "active" ? "ok" : status === "disabled" ? "off" : "warn";
  return `<span class="pill ${className}">${escapeHtml(status)}</span>`;
}

function staffRow(person: OpsStaff, csrf: string): string {
  const rolePills = person.roles
    .map((role) => `<span class="pill">${escapeHtml(role)}</span>`)
    .join("");
  const nextStatus = person.status === "disabled" ? "active" : "disabled";
  const statusLabel = person.status === "disabled" ? "Enable" : "Disable";
  const lastLogin = person.lastLoginAt
    ? new Date(person.lastLoginAt).toISOString().replace("T", " ").slice(0, 16)
    : "never";
  return `<tr>
    <td><strong>${escapeHtml(person.email)}</strong><div class="muted">${escapeHtml(person.name)}</div></td>
    <td>${rolePills || '<span class="muted">none</span>'}</td>
    <td>${statusPill(person.status)}</td>
    <td><span class="pill ${person.totpEnrolled ? "ok" : "warn"}">${person.totpEnrolled ? "enrolled" : "not enrolled"}</span>
        <div class="muted">${person.recoveryCodesRemaining} recovery codes</div></td>
    <td class="muted">${escapeHtml(lastLogin)}</td>
    <td class="actions">
      <details>
        <summary>Manage</summary>
        <form method="post" action="/ops/staff">
          <input type="hidden" name="action" value="roles" />
          <input type="hidden" name="email" value="${escapeHtml(person.email)}" />
          <input type="hidden" name="csrf" value="${escapeHtml(csrf)}" />
          <div>${roleChecks(person.roles)}</div>
          <input type="text" name="reason" placeholder="Reason (required)" required />
          <button type="submit">Update roles</button>
        </form>
        <form method="post" action="/ops/staff">
          <input type="hidden" name="action" value="status" />
          <input type="hidden" name="email" value="${escapeHtml(person.email)}" />
          <input type="hidden" name="status" value="${nextStatus}" />
          <input type="hidden" name="csrf" value="${escapeHtml(csrf)}" />
          <input type="text" name="reason" placeholder="Reason (required)" required />
          <button type="submit">${statusLabel}</button>
        </form>
        <form method="post" action="/ops/staff">
          <input type="hidden" name="action" value="reset-totp" />
          <input type="hidden" name="email" value="${escapeHtml(person.email)}" />
          <input type="hidden" name="csrf" value="${escapeHtml(csrf)}" />
          <input type="text" name="reason" placeholder="Reason (required)" required />
          <button type="submit">Reset TOTP</button>
        </form>
        <p style="margin:.4rem 0 0"><a href="/ops/staff/audit?email=${encodeURIComponent(person.email)}">Audit trail</a></p>
      </details>
    </td>
  </tr>`;
}

function approvalRow(request: OpsStaffRequest, actorEmail: string, csrf: string): string {
  const when = request.requestedAt
    ? new Date(request.requestedAt).toISOString().replace("T", " ").slice(0, 16)
    : "";
  const detail =
    request.action === "roles" && Array.isArray(request.payload.roles)
      ? ` -> ${request.payload.roles.join(", ")}`
      : request.action === "status" && typeof request.payload.status === "string"
        ? ` -> ${request.payload.status}`
        : "";
  const own = request.requestedBy === actorEmail;
  return `<div class="approval">
    <div><strong>${escapeHtml(request.action)}</strong> ${escapeHtml(request.targetEmail)}${escapeHtml(detail)}</div>
    <div>${escapeHtml(request.reason)}</div>
    <div class="meta">requested by ${escapeHtml(request.requestedBy)} - ${escapeHtml(when)}</div>
    ${
      own
        ? '<div class="meta">Awaiting another active superadmin.</div>'
        : `<form method="post" action="/ops/staff/approvals">
             <input type="hidden" name="request_id" value="${escapeHtml(request.id)}" />
             <input type="hidden" name="decision" value="approved" />
             <input type="hidden" name="csrf" value="${escapeHtml(csrf)}" />
             <input type="text" name="reason" placeholder="Decision reason" required />
             <button type="submit">Approve</button>
           </form>
           <form method="post" action="/ops/staff/approvals">
             <input type="hidden" name="request_id" value="${escapeHtml(request.id)}" />
             <input type="hidden" name="decision" value="rejected" />
             <input type="hidden" name="csrf" value="${escapeHtml(csrf)}" />
             <input type="text" name="reason" placeholder="Decision reason" required />
             <button type="submit">Reject</button>
           </form>`
    }
  </div>`;
}

export function opsStaffPage(options: {
  actorEmail: string;
  staff: OpsStaff[];
  requests: OpsStaffRequest[];
  csrf: string;
  message?: string;
  error?: string;
  inviteUrl?: string;
  inviteEmail?: string;
  inviteWarning?: string;
}): string {
  const rows = options.staff.map((person) => staffRow(person, options.csrf)).join("");
  const approvals = options.requests
    .map((request) => approvalRow(request, options.actorEmail, options.csrf))
    .join("");
  return layout(
    "Staff",
    `<h1>Staff directory</h1>
     <p>Signed in as <strong>${escapeHtml(options.actorEmail)}</strong>. This list controls who can
        reach the operator surfaces after TOTP enrolment.</p>
     ${options.message ? `<div class="banner ok">${escapeHtml(options.message)}</div>` : ""}
     ${options.error ? `<div class="banner err">${escapeHtml(options.error)}</div>` : ""}
     ${
       options.inviteWarning
         ? `<div class="banner err">${escapeHtml(options.inviteWarning)}</div>`
         : ""
     }
     ${
       options.inviteUrl
         ? `<div class="banner ok">
              <strong>Mercur invite for ${escapeHtml(options.inviteEmail ?? "")}</strong>
              <p style="margin:.4rem 0">Send this one-time link to set their Mercur password:</p>
              <input type="text" readonly value="${escapeHtml(options.inviteUrl)}"
                     onclick="this.select()" style="width:100%" />
              <button type="button" onclick="navigator.clipboard.writeText(this.previousElementSibling.value)">Copy link</button>
            </div>`
         : ""
     }
     <div class="invite">
       <strong>Pending second approval</strong>
       <p class="muted">Superadmin create, role, disable and TOTP reset requests need a different
          active superadmin. If only one superadmin exists, seed a second with
          <code>ops:staff:bootstrap</code> before relying on this workflow.</p>
       ${approvals || '<p class="muted">No pending requests.</p>'}
     </div>
     <div class="invite">
       <strong>Invite staff</strong>
       <form method="post" action="/ops/staff">
         <input type="hidden" name="action" value="invite" />
         <input type="hidden" name="csrf" value="${escapeHtml(options.csrf)}" />
         <label for="email">Email</label>
         <input id="email" name="email" type="email" autocomplete="off" required />
         <label for="name">Name</label>
         <input id="name" name="name" type="text" autocomplete="off" />
         <label>Roles</label>
         <div>${roleChecks(["support_operator"])}</div>
         <label for="reason">Reason</label>
         <input id="reason" name="reason" type="text" required />
         <button type="submit">Invite</button>
       </form>
     </div>
     <table>
       <thead><tr><th>Person</th><th>Roles</th><th>Status</th><th>TOTP</th><th>Last login</th><th>Actions</th></tr></thead>
       <tbody>${rows || '<tr><td colspan="6" class="muted">No staff yet.</td></tr>'}</tbody>
     </table>
     <p style="margin-top:1rem"><a href="/v1/ops/staff/export.csv">Export access review CSV</a></p>
     <div class="footer">Every action is audited with the actor and reason. A second-approver
       workflow for superadmin changes is still pending; do not add a second superadmin until it is
       in place.</div>`,
    { wide: true },
  );
}

export function opsStaffAuditPage(options: {
  actorEmail: string;
  targetEmail: string;
  rows: Array<Record<string, unknown>>;
}): string {
  const rows = options.rows
    .map((row) => {
      const at = row.at ? new Date(String(row.at)).toISOString().replace("T", " ").slice(0, 19) : "";
      const before = row.before ? JSON.stringify(row.before) : "";
      const after = row.after ? JSON.stringify(row.after) : "";
      const change = [before && `from ${before}`, after && `to ${after}`].filter(Boolean).join(" ");
      return `<tr>
        <td class="muted">${escapeHtml(at)}</td>
        <td>${escapeHtml(String(row.actor_email ?? ""))}</td>
        <td><code>${escapeHtml(String(row.action ?? ""))}</code></td>
        <td>${escapeHtml(String(row.reason ?? ""))}</td>
        <td class="muted">${escapeHtml(change.slice(0, 300))}</td>
      </tr>`;
    })
    .join("");
  return layout(
    "Audit",
    `<h1>Audit trail</h1>
     <p>${escapeHtml(options.targetEmail)} - signed in as ${escapeHtml(options.actorEmail)}.</p>
     <table>
       <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Reason</th><th>Change</th></tr></thead>
       <tbody>${rows || '<tr><td colspan="5" class="muted">No audit rows.</td></tr>'}</tbody>
     </table>
     <p style="margin-top:1rem"><a href="/ops/staff">Back to staff</a></p>`,
    { wide: true },
  );
}
