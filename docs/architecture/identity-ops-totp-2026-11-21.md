# Ops identity: superadmin staff directory + TOTP

Status: **accepted for production** · selected by the human requester on 2026-11-21 · not yet
implemented · Google Workspace/Entra is no longer required for the production release.

This decision replaces a real IdP with a BazarBee-owned staff directory and a second factor at the
application. Cloudflare Access remains the outer gate. It is a compensating control, not an
equivalent to Google Workspace or Entra; the limits are listed in §8.

## 1. Context

- Cloudflare Access is live on staging at `ops.gobazarbee.com` with One-time PIN (email code).
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
seller_admin (optional)                            → BazarBee Sellers
```

The gate uses the `ops_staff.roles` value; Cloudflare group membership is only the edge allowlist.

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
| `/dashboard`, `/seller`, `/erp/`, `/admin`, `/auth`, `/static`, `/uploads` | nginx `auth_request` |
| `/v1/ops/*`, `/v1/admin/*`, `/metrics` on the ops host | nginx `auth_request` |
| `/ops/login`, `/ops/enroll`, `/v1/ops/auth/*` | excluded from the gate, still behind Cloudflare Access |
| Customer, API and app hosts | unchanged, no ops gate |

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

1. A new staff user cannot reach any ops path until TOTP enrolment completes.
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
