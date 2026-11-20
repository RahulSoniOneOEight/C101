# Cloudflare Access for ops, seller and ERP

Status: **planned** · not yet configured in the Cloudflare account.

The customer host stays on the application's own email OTP/magic-link auth. Cloudflare Access is the
outer gate for `ops.bazarbee.com` only.

## 1. Surfaces

| Hostname | Access application | Notes |
|---|---|---|
| `ops.bazarbee.com/dashboard` | `bazarbee-ops-admin` | Mercur admin |
| `ops.bazarbee.com/seller` | `bazarbee-seller` | Seller portal |
| `ops.bazarbee.com/erp/` | `bazarbee-erp` | Tryton |
| `api.bazarbee.com` | **No Access** | Storefront/Flutter public API |
| `bazarbee.com` | **No Access** | Customer web |
| `app.bazarbee.com` | **No Access** | Flutter app |

Webhook paths on the API host must remain publicly reachable with signature verification; never put
the whole API host behind Access.

## 2. Identity providers

1. Google Workspace (staff) or Microsoft Entra ID (if Microsoft is the company directory).
2. One-time PIN as the email-code fallback for invited sellers and break-glass.
3. Optional hardware-key policy for release/security administrators.

## 3. Policies

### Staff admin

```text
Application: bazarbee-ops-admin
Action: Allow
Include: Google Workspace group bazarbee-staff OR email domain @bazarbee.com
Require: MFA (IdP-enforced)
Session: 8 hours
```

### Sellers

```text
Application: bazarbee-seller
Action: Allow
Include: seller Access group / invited seller emails
Require: MFA for payout, bank change and refund actions (step-up)
Session: 12 hours
```

Sellers are invited. Do not allow open self-signup to the seller application.

### ERP

```text
Application: bazarbee-erp
Action: Allow
Include: finance/ERP staff group
Require: MFA
Session: 8 hours
```

Tryton users remain named per person. Access is the outer gate; Tryton authorization is the inner
gate.

### Break glass

- one named security administrator
- Access one-time PIN plus hardware key
- time-bounded policy, reviewed monthly
- every use alerts Security

## 4. Cloudflare configuration steps

1. Put the zone on Cloudflare nameservers and proxy the ops hostname (orange cloud).
2. Create a Cloudflare Tunnel or proxied origin for `ops.bazarbee.com`.
3. Restrict the origin firewall to Cloudflare IP ranges only; no public origin port for ops.
4. Create the three Access applications above.
5. Add Google Workspace / Entra as the IdP; enable MFA enforcement in the IdP.
6. Create Access groups:
   - `bazarbee-staff`
   - `bazarbee-sellers`
   - `bazarbee-finance-erp`
7. Set session durations and require MFA.
8. Enable WAF managed rules and rate limiting on `/dashboard`, `/seller` and `/erp/`.
9. Verify `Cf-Access-Jwt-Assertion` is present at the origin for allowed requests.
10. Confirm the API host and customer hosts are **not** behind Access.

## 5. Verification

- unauthenticated `ops.bazarbee.com/dashboard` redirects to Access
- staff Google account with MFA reaches the admin console
- seller account reaches only the seller portal
- ERP group reaches `/erp/`; other staff do not
- customer token cannot call ops routes
- service-to-service webhooks still work without Access
- origin is unreachable when bypassing Cloudflare
- Access logs show named users, not shared accounts

## 6. Current state

- `ops-staging.pinakaplay.cloud` is not behind Access; `/dashboard` returns 200 directly from nginx
- admin/seller/ERP still use application passwords
- the staging admin password was temporarily set to `supersecret` for QC
- this document is the production configuration baseline, not evidence of completion

## 7. Status check — 2026-11-21

| Check | Result |
|---|---|
| Supplied Cloudflare API token | `401 Invalid API Token` — cannot query accounts, Access apps, groups or IdPs |
| `gobazarbee.com` nameservers | Hostinger parking (`horizon/orbit.dns-parking.com`), not Cloudflare |
| `pinakaplay.cloud` nameservers | Hostinger parking (`aurora/nebula.dns-parking.com`) |
| `ops-staging.pinakaplay.cloud` | resolves to `89.116.20.164`, served directly by nginx; no `cf-ray`, no Access redirect |
| `bazarbee.com` | resolves to `74.220.199.6`; connection times out, not serving the app |

Access cannot be enabled until the zone is on Cloudflare nameservers and the ops host is proxied
through Cloudflare (orange cloud or Tunnel). A valid API token with Access: Apps/Groups/IdP read-write
is also required.
