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
| API token | Account reads succeed; `/user/tokens/verify` returns 401 because the token is account-scoped |
| Account | `Gobazarbee@gmail.com's Account` (`a6f468c20d83314a619ce00e7c5a8ddd`) |
| Zero Trust / Access | **Enabled** — team domain `bazarbee.cloudflareaccess.com` |
| Zone | `gobazarbee.com` added, status **pending**; nameservers `jillian.ns.cloudflare.com`, `odin.ns.cloudflare.com` |
| Zone DNS | 3 records created: `A @` and `A www` → `89.116.20.164` (proxied), Google verification TXT |
| SSL mode | `strict` |
| Access groups | 3 created: Staff, Sellers, ERP |
| Access apps | 0 — creation returns `domain does not belong to zone` until the zone is active |
| IdPs | 0 external IdPs; Cloudflare One-time PIN is available |
| `ops-staging.pinakaplay.cloud` | direct nginx on `89.116.20.164`; no `cf-ray`, no Access redirect |

Group IDs:

```text
BazarBee Staff    8402ec6c-94db-4b02-ae31-4af4e2886f97
BazarBee Sellers  526ab49c-3701-49e8-aa43-7c5d4bd1bbb0
BazarBee ERP      5ce76749-9f8e-46b2-bb52-2ff6804c79d8
```

### Required next steps

1. At Hostinger, change the `gobazarbee.com` nameservers to:
   - `jillian.ns.cloudflare.com`
   - `odin.ns.cloudflare.com`
2. Wait for the zone to become `active`.
3. Create the three Access applications on `ops.gobazarbee.com`:
   - `/dashboard` → Staff, 8h
   - `/seller` → Sellers, 12h
   - `/erp` → ERP, 8h
4. Point `ops.gobazarbee.com` at the staging/production proxy through Cloudflare.
5. Add Google Workspace or Entra as the IdP and map the groups to it.
6. Restrict the origin so only Cloudflare can reach it.

Until the zone is active, the apps cannot be created and the ops host is not protected by
Access.
