# Cloudflare Access for ops, seller and ERP

Status: **live on staging** at `ops-staging.pinakaplay.cloud` · whole host behind one Access
application · WAF, rate limiting and an origin lock are active · Google Workspace/Entra is not
required under the 2026-11-21 identity decision · production `ops.gobazarbee.com` is still a separate
environment.

The customer host stays on the application's own email OTP/magic-link auth. Cloudflare Access is the
outer gate for the operator host only.

## 1. Surfaces

| Hostname | Access | Notes |
|---|---|---|
| `ops-staging.pinakaplay.cloud` (all paths) | **Yes** - `BazarBee Ops (staging)` | Admin, seller, ERP, `/admin`, `/auth`, `/v1/ops`, `/v1/admin`, `/metrics`, `/health` |
| `staging.pinakaplay.cloud` | No | Staging customer web |
| `api-staging.pinakaplay.cloud` | No | Storefront/Flutter API |
| `app-staging.pinakaplay.cloud` | No | Flutter app |

Production is planned on `ops.gobazarbee.com`, `gobazarbee.com`, `api.gobazarbee.com` and
`app.gobazarbee.com`, in a separate Cloudflare account.

Staging moved off `gobazarbee.com` on 2026-11-21 so the apex zone is free for production. A delegated
`staging.gobazarbee.com` zone is not available on the current Cloudflare plan (`1116` root domain
only; partial `1104`; secondary `1111`), so staging uses the `pinakaplay.cloud` root zone instead.
The `gobazarbee.com` apex, `www` and `ops` records and the `BazarBee Ops` app were retired.

A single host-level application replaced the three path-scoped apps. One Access login covers the
whole operator host; Mercur and Tryton still enforce role separation inside the app. This closes the
gap where `/admin`, `/auth`, `/v1/ops` and `/metrics` were reachable without the outer gate.

The TOTP second factor applies to **admin and ERP paths only**. Sellers stay on the Mercur seller
login behind the Access `BazarBee Sellers` group; `/seller`, `/vendor`, `/auth`, `/static` and
`/uploads` are not TOTP-gated.

## 2. Identity

1. **Cloudflare One-time PIN** is enabled for staging and is factor 1 at the edge.
2. Factor 2 is the BazarBee TOTP gate backed by the superadmin-maintained `ops_staff` list.
3. Google Workspace or Microsoft Entra ID is **not required**; see
   `identity-ops-totp-2026-11-21.md`.
4. Break-glass remains one named security administrator with offline recovery codes.

Staging group membership uses test identities:

- Staff: `gobazarbee@gmail.com`, email domain `gobazarbee.com`
- Sellers: `owner.seller01`, `orders.seller01`, `catalog.seller01`, `owner.seller02`,
  `orders.seller02` at `buildkart.test`
- ERP: `erp.ops01`, `finance.ops01`, `superadmin01` at `buildkart.test`

Only the Staff address can receive a PIN today; the `buildkart.test` addresses are placeholders.

## 3. Controls

| Control | Configuration |
|---|---|
| Access application | `BazarBee Ops (staging)` - `ops-staging.pinakaplay.cloud`, session `8h` |
| Policy | Allow if member of Staff **or** Sellers **or** ERP |
| WAF | Cloudflare Managed Free Ruleset on `pinakaplay.cloud` |
| Rate limit | 120 requests / 10 s per IP per colo on ops entry paths; 10 s block (free-plan limits) |
| Origin lock | Cloudflare adds `X-Bazarbee-Edge`; nginx returns `403` on the ops host without it |
| Group sync | `ops_staff` -> `BazarBee Staff` / `BazarBee ERP`; reconcile every 5 minutes |
| TOTP gate | nginx `auth_request` on `/dashboard`, `/admin`, `/erp/`, `/v1/admin`, `/v1/ops`, `/metrics`; sellers, `/auth`, `/static`, `/uploads` excluded |
| Tunnel | `bazarbee-ops` -> `http://buildkart-hosted-pilot-proxy-1:8080` |

The rate limit covers `/dashboard`, `/seller`, `/erp`, `/admin`, `/auth`, `/v1/ops`, `/v1/admin` and
`/metrics`. The free plan only permits a 10-second period and a 10-second mitigation window.

## 4. IDs

```text
Account            a6f468c20d83314a619ce00e7c5a8ddd
Zone               pinakaplay.cloud  8b1df862067f5271b82c42ea9fe38b46
Team domain        bazarbee.cloudflareaccess.com
Tunnel             5f501407-06a2-4f54-9e35-7362705285d7
Access app         10bf06de-f005-44db-8bb6-de14ea6c9c6c  (BazarBee Ops (staging))
App AUD            5349b42a37b60700201b76240a53bde675ade178a98a5f65ad33f96303ace1ab

BazarBee Staff     8402ec6c-94db-4b02-ae31-4af4e2886f97
BazarBee Sellers   526ab49c-3701-49e8-aa43-7c5d4bd1bbb0
BazarBee ERP       5ce76749-9f8e-46b2-bb52-2ff6804c79d8

WAF entrypoint     ed816d8291f14f979ba806eaaa550f7b
Rate limit rule    ded6da1f587c46938e848e55bc3b0b59
Transform rule     25beee8ad5db4be0b8c91c57a1f46875
One-time PIN IdP   abbf6c39-c8e7-446e-a3c1-05ae508d144f
```

The previous `gobazarbee.com` zone (`8441f15c...`), app (`5e060aec...`), WAF (`998f3830...`), rate
limit (`c602bc4b...`) and transform rule (`09aea3be...`) belong to the retired staging host.

## 5. Verification - 2026-11-21

| Check | Result |
|---|---|
| `https://staging.pinakaplay.cloud/` | `200` |
| `https://ops-staging.pinakaplay.cloud/dashboard` | `302` to Access, app `kid` `5349...` |
| `/ops/enroll` | `302` to Access |
| Origin with `Host: ops-staging.pinakaplay.cloud` and **no** edge header | `403` |
| Origin with the edge header | `200` |
| End-to-end through Cloudflare with a token | `/dashboard/login` `200`, `/dashboard/cod` `200`, `/v1/ops/audit` `401` (app auth still required) |
| `api-staging` / `app-staging` | `200`, unaffected |
| Old `ops.gobazarbee.com` | DNS and Access app removed |
| Old `gobazarbee.com` staging web | `404`; zone reserved for production |
| `pinakaplay.cloud` zone / SSL | active / `active` |
| Enforce: `/dashboard`, `/erp/`, `/v1/admin`, `/metrics` | `302` to `/ops/login` |
| Enforce: `/seller`, `/static`, `/ops/login`, `/health` | unaffected |
| Live group sync | invite -> Staff, finance role -> ERP, disable -> removed, reconcile -> re-added |

The end-to-end test used a one-hour service token; it was deleted together with its policy. No
standing service token remains.

## 6. Remaining

1. **Second factor** - Google Workspace/Entra is **not required**. The production decision is a
   superadmin-maintained `ops_staff` directory plus app-level TOTP, bound to the Cloudflare-verified
   email. See `identity-ops-totp-2026-11-21.md`. One-time PIN alone is factor 1 only; it must not be
   treated as MFA.
2. **Production `ops.gobazarbee.com`** - separate Cloudflare account, tunnel, Access app, groups and
   staff directory. `gobazarbee.com` is now free of staging; the zone transfer is the cutover.
   Cannot be created before `D-020-12` authorises an immutable release.
3. **Health monitoring** - `/health` is now behind Access. Monitors must use a scoped service token
   or an internal probe.
4. **Network-level origin restriction** - the header lock blocks spoofed ops requests, but the VPS
   still accepts direct traffic for the customer/API/app hosts. Closing 80/443 to Cloudflare ranges
   requires moving those hosts onto Cloudflare first.
5. **Admin password** - staging is still `admin@buildkart.test / supersecret`; rotate it.
