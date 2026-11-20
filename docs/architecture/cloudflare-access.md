# Cloudflare Access for ops, seller and ERP

Status: **live on staging** at `ops.gobazarbee.com` · whole host behind one Access application ·
WAF, rate limiting and an origin lock are active · Google Workspace/Entra IdP and production are
still open.

The customer host stays on the application's own email OTP/magic-link auth. Cloudflare Access is the
outer gate for the operator host only.

## 1. Surfaces

| Hostname | Access | Notes |
|---|---|---|
| `ops.gobazarbee.com` (all paths) | **Yes** — `BazarBee Ops` | Admin, seller, ERP, `/admin`, `/auth`, `/v1/ops`, `/v1/admin`, `/metrics`, `/health` |
| `gobazarbee.com` | No | Customer web |
| `api-staging.pinakaplay.cloud` | No | Storefront/Flutter API |
| `app-staging.pinakaplay.cloud` | No | Flutter app |

A single host-level application replaced the three path-scoped apps. One Access login covers the
whole operator host; Mercur and Tryton still enforce role separation inside the app. This closes the
gap where `/admin`, `/auth`, `/v1/ops` and `/metrics` were reachable without the outer gate.

Production will use the same shape on `ops.bazarbee.com`, in a separate environment.

## 2. Identity

1. **Cloudflare One-time PIN** is enabled for staging.
2. Google Workspace or Microsoft Entra ID is required for production, with MFA enforced in the IdP.
3. Break-glass remains one named security administrator with a hardware key.

Staging group membership uses test identities:

- Staff: `gobazarbee@gmail.com`, email domain `gobazarbee.com`
- Sellers: `owner.seller01`, `orders.seller01`, `catalog.seller01`, `owner.seller02`,
  `orders.seller02` at `buildkart.test`
- ERP: `erp.ops01`, `finance.ops01`, `superadmin01` at `buildkart.test`

Only the Staff address can receive a PIN today; the `buildkart.test` addresses are placeholders.

## 3. Controls

| Control | Configuration |
|---|---|
| Access application | `BazarBee Ops` — `ops.gobazarbee.com`, session `8h` |
| Policy | Allow if member of Staff **or** Sellers **or** ERP |
| WAF | Cloudflare Managed Free Ruleset enabled on the zone |
| Rate limit | 120 requests / 10 s per IP per colo on ops entry paths; 10 s block (free-plan limits) |
| Origin lock | Cloudflare adds `X-Bazarbee-Edge`; nginx returns `403` on the ops host without it |
| Tunnel | `bazarbee-ops` → `http://buildkart-hosted-pilot-proxy-1:8080` |

The rate limit covers `/dashboard`, `/seller`, `/erp`, `/admin`, `/auth`, `/v1/ops`, `/v1/admin` and
`/metrics`. The free plan only permits a 10-second period and a 10-second mitigation window.

## 4. IDs

```text
Account            a6f468c20d83314a619ce00e7c5a8ddd
Zone               8441f15c3fa3e0e0d0ff81c1a40d55fa
Team domain        bazarbee.cloudflareaccess.com
Tunnel             5f501407-06a2-4f54-9e35-7362705285d7
Access app         5e060aec-bbff-4f9c-8d81-63c7a887b276  (BazarBee Ops)

BazarBee Staff     8402ec6c-94db-4b02-ae31-4af4e2886f97
BazarBee Sellers   526ab49c-3701-49e8-aa43-7c5d4bd1bbb0
BazarBee ERP       5ce76749-9f8e-46b2-bb52-2ff6804c79d8

WAF entrypoint     998f3830fd8c43ca88e503812ba6d6dc
Rate limit rule    c602bc4b9866462aacb5b9e0f1673d05
Transform rule     09aea3be48734319a6a166c618965f37
One-time PIN IdP   abbf6c39-c8e7-446e-a3c1-05ae508d144f
```

## 5. Verification — 2026-11-21

| Check | Result |
|---|---|
| `/dashboard`, `/seller`, `/erp/` | `302` to Access, same app `kid` |
| `/admin`, `/auth/login`, `/v1/ops/audit`, `/metrics`, `/`, `/health` | `302` to the same Access app |
| Origin with `Host: ops.gobazarbee.com` and **no** edge header | `403` |
| Origin with the edge header | `200` |
| Direct `https://89.116.20.164` with a spoofed ops Host | `403` for `/dashboard` and `/health` |
| End-to-end through Cloudflare with a token | `/dashboard/login` `200`, `/health` `200`, `/v1/ops/audit` `401` (app auth still required) |
| `gobazarbee.com` | `200`, unaffected |
| `api-staging` / `app-staging` | `200`, unaffected |
| Old `ops-staging.pinakaplay.cloud` | `503`, no operator routes |

The end-to-end test used a one-hour service token; it was deleted together with its policy. No
standing service token remains.

## 6. Remaining

1. **Second factor** — Google Workspace/Entra is **not required**. The production decision is a
   superadmin-maintained `ops_staff` directory plus app-level TOTP, bound to the Cloudflare-verified
   email. See `identity-ops-totp-2026-11-21.md`. One-time PIN alone is factor 1 only; it must not be
   treated as MFA.
2. **Production `ops.bazarbee.com`** — separate environment, tunnel, Access app, groups and IdP.
   Cannot be created before `D-020-12` authorises an immutable release.
3. **Health monitoring** — `/health` is now behind Access. Monitors must use a scoped service token
   or an internal probe.
4. **Network-level origin restriction** — the header lock blocks spoofed ops requests, but the VPS
   still accepts direct traffic for the customer/API/app hosts. Closing 80/443 to Cloudflare ranges
   requires moving those hosts onto Cloudflare first.
5. **Admin password** — staging is still `admin@buildkart.test / supersecret`; rotate it.
