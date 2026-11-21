# Ops identity: superadmin staff directory + TOTP

Status: **accepted for production** · selected by the human requester on 2026-11-21 · slices 1–5 and
the second-approver workflow implemented · gate **enforced** on staging · manual UAT items and
production provisioning pending.

This decision replaces a real IdP with a BazarBee-owned staff directory and a second factor at the
application. Cloudflare Access remains the outer gate. It is a compensating control, not an
equivalent to Google Workspace or Entra; the limits are listed in §8.

## 1. Context

- Cloudflare Access is live on staging at `ops-staging.pinakaplay.cloud` with One-time PIN (email
  code).
- There is no Google Workspace or Entra tenant for `gobazarbee.com`; the domain has no MX.
- Production needs named staff accounts, MFA, immediate offboarding and an audit trail.
- Sellers are external and keep their Medusa seller accounts; this decision covers ops staff
  (admin, finance/ERP, support, superadmin).

## 2. Decision

1. A **superadmin-maintained staff directory** (`ops_staff`) is the authority for who may use the
   operator surfaces.
2. **Cloudflare Access One-time PIN** stays as factor 1 at the edge.
3. **TOTP** in BazarBee is factor 2. It is bound to the email that Cloudflare already verified, so
   the user does not receive a second email code.
4. nginx gates every operator path with an `auth_request` to the Experience API. No valid
   `bz_ops_session` means no request reaches Mercur, Tryton or the ops APIs.
5. The superadmin manages staff at `/ops/staff`. Changes are audited and synced to the Cloudflare
   Access groups.

```text
Browser
  │
  ▼
Cloudflare Access  ── factor 1: email one-time PIN, 8h CF_Authorization
  │  Cf-Access-Jwt-Assertion (signed)
  ▼
Cloudflare Tunnel → nginx
  │  auth_request /__ops_gate
  ▼
Experience API gate
  │  verify Access JWT → email
  │  ops_staff active?
  │  bz_ops_session valid and TOTP-verified?
  ├─ no  → 302 /ops/login (or /ops/enroll)
  └─ yes → proxy to Mercur / Tryton / ops API
             │
             └─ Mercur or Tryton role check (inner gate)
```

## 3. Why bind TOTP to the Cloudflare JWT

A second email code would just repeat factor 1 and add friction. Cloudflare signs
`Cf-Access-Jwt-Assertion` for every allowed request. The gate verifies that JWT against the team's
JWKS (`https://bazarbee.cloudflareaccess.com/cdn-cgi/access/certs`), checks `aud`, `iss`, `exp` and
extracts `email`. That email must exist in `ops_staff` and be `active`. TOTP is then checked for that
same email.

Direct-to-origin requests cannot forge this: the origin lock rejects any request without
`X-Bazarbee-Edge`, and Cloudflare overwrites the JWT header at the edge.

## 4. Data model

```text
ops_staff
  id                  text primary key
  email               citext unique, lowercased
  name                text
  roles               text[]        -- super_admin, marketplace_operator, finance_operator, ...
  status              text          -- invited | active | disabled
  totp_secret_enc     text          -- AES-256-GCM, never plaintext
  totp_confirmed_at   timestamptz
  totp_last_step      bigint        -- replay prevention
  recovery_hashes     text[]        -- SHA-256 of single-use codes
  failed_attempts     int
  locked_until        timestamptz
  created_by          text
  created_at          timestamptz
  disabled_at         timestamptz
  disabled_by         text
  last_login_at       timestamptz

ops_staff_audit
  id, staff_id, actor_email, action, reason, before jsonb, after jsonb, at
```

- `OPS_TOTP_ENCRYPTION_KEY` is a 32-byte base64 key in `/etc/buildkart/secrets/ops-identity.env`.
  It is never committed. Without it the gate refuses to start.
- Recovery codes are shown once, stored only as hashes, and consumed atomically.

## 5. Flows

### Invite and enrol

```text
superadmin → /ops/staff → add email + roles
  status = invited
  sync: add email to the matching Cloudflare Access group
user opens ops host → Cloudflare PIN → gate sees invited
  → /ops/enroll: show otpauth:// URI and secret
  → user enters a code → status = active, recovery codes shown once
```

### Mercur admin invite

The staff invite also creates a Medusa/Mercur admin invite for the same email. The page shows a
one-time `https://<ops-host>/dashboard/invite?token=...` link, so the superadmin can send it when
Medusa email delivery is unavailable (staging). The invitee sets their Mercur password, then uses it
after Access + TOTP.

Production should use a dedicated Medusa service admin for this call, not the shared bootstrap admin.

### Login

```text
Cloudflare PIN → gate: Access JWT email + active staff + no session
  → /ops/login: enter TOTP
  → session cookie bz_ops_session (HttpOnly, Secure, SameSite=Lax, 8h)
  → redirect to the original path
```

### Disable

```text
superadmin disables with a reason
  → status = disabled
  → all bz_ops_session tokens for that email revoked
  → email removed from every Cloudflare Access group
  → Mercur/Tryton account disabled (hook or operator task, recorded)
  → audit row
```

The app is authoritative. If the Cloudflare sync fails, the gate still denies the user and an alert
is raised; the edge group is retried.

### Role change

Roles map to Cloudflare groups:

```text
super_admin, marketplace_operator, support_operator → BazarBee Staff
finance_operator, erp_operator                     → BazarBee ERP
```

The gate uses the `ops_staff.roles` value; Cloudflare group membership is only the edge allowlist.
Seller accounts are Medusa seller accounts and are **not** in `ops_staff`; the optional
`seller_admin` role is not used for the TOTP gate.

## 6. Superadmin surface

`/ops/staff`, gated by the same TOTP session and restricted to `super_admin`:

- list, search, filter by status and role
- invite, resend invite, change roles, disable/enable
- reset TOTP (reason required) and force logout
- show last login, MFA state, failed attempts
- export access review (CSV)
- every action writes `ops_staff_audit`

Adding a superadmin or changing a superadmin's roles requires a second approver (existing
`super-admin actions require independent second approval` rule). The UI enforces the reason field.

## 7. Enforcement points

| Surface | Gate |
|---|---|
| `/dashboard`, `/erp/` | nginx `auth_request` |
| `/admin`, `/v1/admin/*`, `/v1/ops/*`, `/metrics` on the ops host | nginx `auth_request` |
| `/seller`, `/vendor`, `/auth`, `/static`, `/uploads` | **Cloudflare Access only** — sellers stay on Mercur login |
| `/ops/login`, `/ops/enroll`, `/ops/logout`, `/v1/ops/totp/*`, `/v1/ops/gate` | excluded from the gate, still behind Cloudflare Access |
| Customer, API and app hosts | unchanged, no ops gate |

Sellers are intentionally outside the TOTP gate. They reach `/seller` through the Access `BazarBee
Sellers` group and then authenticate with their Mercur seller password. `/auth`, `/static` and
`/uploads` are shared with the seller UI, so they cannot be gated without breaking it; the Mercur
password remains the inner gate for those paths. Seller payout or bank-detail changes need a
step-up check later.

Feature flag `OPS_TOTP_GATE=off|shadow|enforce`:

- `off` — current behaviour, gate not wired.
- `shadow` — gate evaluates and logs would-be denials, still proxies.
- `enforce` — denials block.

Staging starts in `shadow`, then `enforce` after UAT.

## 8. Limits and compensating controls

| Limit | Control |
|---|---|
| TOTP is phishable in real time | Short sessions; alert on repeated failures; passkeys are the later upgrade |
| No device posture or conditional access | Cloudflare WAF/rate limits; optional IP allowlist for ERP later |
| Email compromise still grants factor 1 | Factor 2 is independent; disable is immediate |
| Superadmin is a high-value account | Second approver, audit, alerting, offline break-glass |
| Mercur and Tryton sessions are separate | Disable hook plus force-logout; documented operator step |
| Auditor may prefer a recognised IdP | Recorded as an accepted compensating control with owner and review date |

## 9. Acceptance criteria

1. A new staff user cannot reach any admin or ERP path until TOTP enrolment completes.
2. Invalid TOTP is rejected; a reused code is rejected; five failures lock for 15 minutes.
3. Disable revokes the app session and removes the Cloudflare group entry within 60 seconds.
4. Every create, role change, MFA reset, enable and disable writes an audit row with actor and reason.
5. No shared accounts; email is unique and lowercased.
6. Recovery codes are single-use; a used code cannot authenticate again.
7. A request without a valid `Cf-Access-Jwt-Assertion` is denied even with a valid session cookie.
8. A request to the origin with a spoofed ops Host and no edge header is denied (already proven).
9. `/ops/staff` is unreachable without `super_admin`.
10. Break-glass superadmin works with offline recovery and is audited.

## 10. Build slices

1. `ops-staff-store.ts` + TOTP engine + recovery codes + audit, with a direct store/TOTP test script.
2. Access JWT verification (JWKS cache) + `bz_ops_session` store + `/v1/ops/gate`.
3. `/ops/enroll` and `/ops/login` pages + rate limits + lockout.
4. `/ops/staff` superadmin UI + audit export.
5. Cloudflare Access group sync + nginx `auth_request` wiring.
6. Staging UAT in `shadow`, then `enforce`: join, enrol, login, wrong code, replay, disable, role
   change, recovery, break-glass.
7. Production: same image and config; gate starts in `shadow` for the release candidate, `enforce`
   after the production UAT.

Rollback: set `OPS_TOTP_GATE=off`, restart the API and proxy. No schema rollback is needed; the
tables are additive.

## 11. Effect on the production gate

- Google Workspace/Entra is marked **not required**, replaced by this decision.
- The identity gate requires evidence of §9 and a named owner for the staff directory.
- Review date: 90 days after the first production staff user, or when an IdP becomes available.

## 12. Progress — 2026-11-21

| Slice | State | Evidence |
|---|---|---|
| 1. Staff store + TOTP | done | RFC 6238 vectors, single-use TOTP and recovery codes, lockout, audit; staging DB test passed; rows cleaned up |
| 2. Access JWT + session + gate | done, shadow | JWT failure modes, gate decision matrix, Redis issue/resolve/revoke; `/v1/ops/gate` returns `204` + `x-ops-shadow-status: 401` |
| 3. Login/enrolment pages | done | CSRF issue/verify/expiry/tamper, escaped pages, `/ops/login` and `/ops/enroll` return `401 Access required` without an Access JWT; forms fail closed; first superadmin seeded |
| 4. `/ops/staff` superadmin UI | done (API + page) | list, invite, roles, disable/enable, TOTP reset, audit page, CSV; guards prevent self-disable and last-superadmin removal; **second-approver workflow** for superadmin create/role/status/TOTP reset; staging DB test passed; endpoints fail closed |
| 5. Cloudflare group sync + nginx | done, shadow | live add/move/remove/reconcile against the real Staff and ERP groups; admin/ERP paths return `302 /ops/login` in enforce while seller/static/health pass; restored to shadow |
| 6. Staging UAT shadow → enforce | **enforce live** | enrolment confirmed and TOTP login verified (`last_login_at`, dashboard assets 200, no shadow denials); unauthenticated admin/ERP paths redirect to `/ops/login`; wrong-code lockout, disable/role UAT and a second-superadmin approval still need manual or test-user coverage |

### Slice 5 evidence

- The Staff group is **explicit-email only**; the blanket `gobazarbee.com` domain rule was removed.
- `CloudflareAccessGroupSync` adds, moves and removes emails on invite, role change and disable.
- Reconciliation runs 15 seconds after boot and every 5 minutes; the log shows
  `ops.access_group.reconcile` with `ok:true`.
- Live group test:

```text
invite support role        -> Staff group contains the email
role change finance        -> ERP contains it, Staff removes it
disable                    -> ERP removes it
reconcile active support   -> Staff re-adds it
cleanup                    -> no test email remains
```

- nginx enforcement test with `OPS_TOTP_GATE=enforce`:

```text
/dashboard/login            302 https://.../ops/login?next=/dashboard/login
/dashboard/assets/...       302 https://.../ops/login?next=/dashboard/assets/...
/erp/                       302 https://.../ops/login?next=/erp/
/v1/admin/orders            302 https://.../ops/login?next=/v1/admin/orders
/metrics                    302 https://.../ops/login?next=/metrics
/seller                     301 /seller/            (not gated)
/static/...                 404                     (not gated)
/ops/login                  401 Access required     (not gated)
/health                     200                     (not gated)
```

Staging is back on `OPS_TOTP_GATE=shadow`. The production token must be scoped to Access Groups
edit only; the staging token is stored in `experience-api.env` on the host and is not committed.

### Second-approver workflow

- Sensitive actions create a pending `ops_staff_request` instead of applying: creating a superadmin,
  changing roles on or to `super_admin`, disabling/enabling a superadmin, and resetting a superadmin's
  TOTP.
- A **different** active superadmin approves or rejects with a reason. The requester can never approve
  their own request. Requests expire after 24 hours.
- An approved action is applied by the approver, audited with the approver as actor plus the request id
  and original reason, then synced to Cloudflare.
- The page shows pending approvals and marks the requester's own request as awaiting another
  superadmin.
- Bootstrap: seed two superadmins with `ops:staff:bootstrap`. The workflow cannot bootstrap itself
  because self-approval is blocked.
- Tested on staging: pending list, self-approval block, approval, rejection, request cleanup.

Staging configuration:

```text
OPS_TOTP_GATE=shadow
OPS_ACCESS_TEAM_DOMAIN=bazarbee.cloudflareaccess.com
OPS_ACCESS_AUDIENCE=037248…bf19
OPS_SESSION_TTL_SECONDS=28800
OPS_TOTP_ENCRYPTION_KEY in /etc/buildkart/secrets/experience-api.env
```

The gate endpoint is excluded from the normal bearer-session pre-check. nginx does not call it yet, so
no request is blocked. The customer API host returns `404` for `/v1/ops/gate`; the ops host remains
behind Access.

### Slice 3 — pages and verification

```text
GET  /ops/login              TOTP form, CSRF-bound, redirects enrolled users to /dashboard
GET  /ops/enroll             secret + otpauth URI + confirmation form
POST /v1/ops/totp/verify     TOTP or recovery code → bz_ops_session (8h, HttpOnly, Secure, Lax)
POST /v1/ops/totp/enroll     confirms the first code, sets totp_last_step, shows recovery codes once
GET  /ops/logout             revokes the session and clears the cookie
bun run ops:staff:bootstrap  seeds the first superadmin (no secret printed)
```

Rate limits: 20 verify attempts / 10 min per IP, 10 enrolment attempts / 10 min per IP, plus the
5-failure / 15-minute account lockout. Forms require a same-origin request and a 10-minute HMAC token
bound to the Cloudflare-verified email.

First staging superadmin:

```text
gobazarbee@gmail.com   super_admin   status invited   TOTP not enrolled
```

The next action is browser UAT: sign in through Access, open `/ops/enroll`, add the secret to an
authenticator, confirm a code, save the recovery codes, then sign in at `/ops/login`.

### Mercur invite automation

- `/ops/staff` invite creates the Medusa admin invite for the same email and shows the one-time
  `dashboard/invite?token=...` link.
- Live staging check: created and revoked a real invite; the URL uses the public ops base.
- Staging has no Medusa email provider, so the link is the delivery path. Production can also use
  Medusa's sender.
- The API uses `MEDUSA_ADMIN_EMAIL` / `MEDUSA_ADMIN_PASSWORD`; production must use a dedicated
  service admin with a minimum role, not the shared bootstrap admin.

## 13. Production decisions — 2026-11-21

| Decision | Value |
|---|---|
| Seller access | Sellers stay on the **Mercur seller login**. No BazarBee TOTP. The Access `BazarBee Sellers` group remains the edge gate. Seller payout and bank-detail changes need a step-up check later. |
| Cloudflare isolation | Production uses a **separate Cloudflare account**: own zone, team domain, Access app, groups, tunnel, AUD and transform rule. No production asset is shared with staging. |
| MFA compensating control | Accepted in writing by the requester on 2026-11-21: superadmin-maintained staff list + TOTP + Access One-time PIN. Owner: Release Authority. Review: 90 days after the first production staff user. A security auditor may still require a recognised IdP; this is a compensating control, not an IdP equivalent. |
| Rate limiting | Free-tier limits accepted: 120 requests / 10 s per IP per colo, 10-second mitigation. Application lockout (5 failures / 15 min) and WAF remain. Residual: a sustained distributed attack is not fully mitigated at the edge; upgrade the plan if measurements show a need. |

