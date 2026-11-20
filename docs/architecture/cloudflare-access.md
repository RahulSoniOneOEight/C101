# Cloudflare Access for ops, seller and ERP

Status: **live on staging** at `ops.gobazarbee.com` · production `ops.bazarbee.com` is still a
separate environment to be created · Google Workspace/Entra IdP and origin firewall are pending.

The customer host stays on the application's own email OTP/magic-link auth. Cloudflare Access is the
outer gate for the operator host only.

## 1. Surfaces

| Hostname | Access application | Notes |
|---|---|---|
| `ops.gobazarbee.com/dashboard` | `BazarBee Admin` | Mercur admin |
| `ops.gobazarbee.com/seller` | `BazarBee Seller` | Seller portal |
| `ops.gobazarbee.com/erp/` | `BazarBee ERP` | Tryton |
| `api.gobazarbee.com` | **No Access** | Storefront/Flutter public API |
| `gobazarbee.com` | **No Access** | Customer web |
| `app.gobazarbee.com` | **No Access** | Flutter app |

Webhook paths on the API host must remain publicly reachable with signature verification; never put
the whole API host behind Access.

Production uses the same three applications on `ops.bazarbee.com`; nothing is shared with staging.

## 2. Identity providers

1. Google Workspace (staff) or Microsoft Entra ID (if Microsoft is the company directory).
2. One-time PIN enabled for staging and as the invited-seller / break-glass fallback.
3. Optional hardware-key policy for release/security administrators.

Staging currently has only **One-time PIN**. Google Workspace/Entra needs the customer's IdP tenant
and group names.

## 3. Policies

### Staff admin

```text
Application: BazarBee Admin
Domain:      ops.gobazarbee.com/dashboard
Action:      Allow
Include:     BazarBee Staff group (email domain / named staff)
Require:     MFA (IdP-enforced)
Session:     8 hours
```

### Sellers

```text
Application: BazarBee Seller
Domain:      ops.gobazarbee.com/seller
Action:      Allow
Include:     BazarBee Sellers group (invited seller emails)
Require:     MFA for payout, bank change and refund actions (step-up)
Session:     12 hours
```

Sellers are invited. Do not allow open self-signup to the seller application.

### ERP

```text
Application: BazarBee ERP
Domain:      ops.gobazarbee.com/erp
Action:      Allow
Include:     BazarBee ERP group (finance/ERP staff)
Require:     MFA
Session:     8 hours
```

Tryton users remain named per person. Access is the outer gate; Tryton authorization is the inner
gate.

### Break glass

- one named security administrator
- Access one-time PIN plus hardware key
- time-bounded policy, reviewed monthly
- every use alerts Security

## 4. Configuration

### Done on staging

1. Zone `gobazarbee.com` moved to Cloudflare nameservers; status `active`.
2. Universal SSL issued; zone SSL mode `strict`.
3. Zero Trust enabled; team domain `bazarbee.cloudflareaccess.com`.
4. Cloudflare Tunnel `bazarbee-ops` (`5f501407-06a2-4f54-9e35-7362705285d7`) runs as
   `buildkart-hosted-pilot-cloudflared-1` on the staging host.
5. Tunnel ingress: `ops.gobazarbee.com` → `http://buildkart-hosted-pilot-proxy-1:8080` with the
   original Host header.
6. DNS: `ops` is a proxied CNAME to the tunnel; `@` and `www` are proxied A records to the origin.
7. Three Access applications and groups exist (IDs below).
8. `PUBLIC_OPS_HOSTNAME=ops.gobazarbee.com` on the proxy. The retired
   `ops-staging.pinakaplay.cloud` host no longer serves admin, seller or ERP routes.

### Still to do

1. Add Google Workspace or Entra as the IdP and map the three groups to directory groups.
2. Restrict the origin firewall so only Cloudflare can reach the public hosts; no public origin port
   for ops.
3. Enable WAF managed rules and rate limiting on `/dashboard`, `/seller` and `/erp/`.
4. Verify `Cf-Access-Jwt-Assertion` at the origin (and reject requests without it) for defence in
   depth.
5. Create the same applications on the production hostname in the production Cloudflare account or
   zone.
6. Turn off One-time PIN in production once the real IdP is proven, or keep it as break-glass only.

## 5. IDs

```text
Account            a6f468c20d83314a619ce00e7c5a8ddd
Zone               8441f15c3fa3e0e0d0ff81c1a40d55fa
Team domain        bazarbee.cloudflareaccess.com
Tunnel             5f501407-06a2-4f54-9e35-7362705285d7

BazarBee Staff    8402ec6c-94db-4b02-ae31-4af4e2886f97
BazarBee Sellers  526ab49c-3701-49e8-aa43-7c5d4bd1bbb0
BazarBee ERP      5ce76749-9f8e-46b2-bb52-2ff6804c79d8

BazarBee Admin    b2b75fc2-2a93-4e7b-9bbd-1b6f4075aec4
BazarBee Seller   e94da57b-9474-4cac-8cc2-1d68efc8295d
BazarBee ERP      151cdd48-283c-4220-b8ea-6cc8e207d439
```

## 6. Verification — 2026-11-21

| Check | Result |
|---|---|
| `https://ops.gobazarbee.com/dashboard` unauthenticated | `302` to `bazarbee.cloudflareaccess.com`, `CF_AppSession` set |
| `https://ops.gobazarbee.com/seller` unauthenticated | `302` to Access login for the Seller app |
| `https://ops.gobazarbee.com/erp/` unauthenticated | `302` to Access login for the ERP app |
| Access login page | `Log in to BazarBee Admin` with email one-time PIN |
| Tunnel → origin, Admin | `200` from `/dashboard/login` (temporary service token, since removed) |
| Tunnel → origin, Seller | `200` from `/seller` |
| Tunnel → origin, ERP | `200` from `/erp/` (Tryton SAO) |
| Tunnel → origin, COD page | `200` from `/dashboard/cod` |
| `https://gobazarbee.com/` | `200` through Cloudflare (`cf-ray` present) |
| `https://api-staging.pinakaplay.cloud/health` | `200`, outside Access |
| `https://app-staging.pinakaplay.cloud/` | `200`, outside Access |
| Old `ops-staging.pinakaplay.cloud/dashboard` | `503` — router retired; no admin bypass |
| Service token | created for verification, then deleted; no standing token remains |

## 7. Current state

- Access is the outer gate for staging admin, seller and ERP on `ops.gobazarbee.com`.
- Mercur email/password and Tryton username/password remain the inner gates.
- The staging admin password was temporarily set to `supersecret` during QC — rotate immediately.
- Cloudflare One-time PIN is the only IdP; production must use Google Workspace or Entra with MFA.
- The origin still accepts direct `Host` requests on IP/other hostnames; firewall restriction is
  required before production.
- Production `ops.bazarbee.com` is not created yet. Production is a separate environment with its
  own tunnel, apps, groups and IdPs.
