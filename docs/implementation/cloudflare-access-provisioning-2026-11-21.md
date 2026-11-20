# Cloudflare Access provisioning — 2026-11-21

Status: **live on staging** · `ops.gobazarbee.com` is behind Access · Google Workspace/Entra IdP and
origin firewall are pending.

## 1. Completed

- Connected with the account-scoped API token.
- Enabled Zero Trust / Access for the account.
- Team domain: `bazarbee.cloudflareaccess.com`.
- Added the `gobazarbee.com` zone and completed the nameserver handoff at Hostinger.
- Zone is **active**; Universal SSL issued; SSL mode `strict`.
- Seeded the live DNS records:
  - `A @` → `89.116.20.164`, proxied
  - `A www` → `89.116.20.164`, proxied
  - `CNAME ops` → `5f501407-06a2-4f54-9e35-7362705285d7.cfargotunnel.com`, proxied
  - Google site-verification TXT, DNS only
- Created three Access groups:

```text
BazarBee Staff    8402ec6c-94db-4b02-ae31-4af4e2886f97
BazarBee Sellers  526ab49c-3701-49e8-aa43-7c5d4bd1bbb0
BazarBee ERP      5ce76749-9f8e-46b2-bb52-2ff6804c79d8
```

- Created three Access applications:

```text
BazarBee Admin    b2b75fc2-2a93-4e7b-9bbd-1b6f4075aec4  ops.gobazarbee.com/dashboard  8h
BazarBee Seller   e94da57b-9474-4cac-8cc2-1d68efc8295d  ops.gobazarbee.com/seller     12h
BazarBee ERP      151cdd48-283c-4220-b8ea-6cc8e207d439  ops.gobazarbee.com/erp        8h
```

- Enabled the built-in **One-time PIN** IdP (`abbf6c39-c8e7-446e-a3c1-05ae508d144f`); no external
  IdP yet.
- Created the `bazarbee-ops` Cloudflare Tunnel (`5f501407-06a2-4f54-9e35-7362705285d7`) and ran
  `buildkart-hosted-pilot-cloudflared-1` on the staging host.
- Tunnel ingress: `ops.gobazarbee.com` → `http://buildkart-hosted-pilot-proxy-1:8080` with the
  original Host header.
- Changed staging `PUBLIC_OPS_HOSTNAME` to `ops.gobazarbee.com` and recreated the proxy. The old
  `ops-staging.pinakaplay.cloud` host no longer serves admin, seller or ERP.
- Updated `services/hosted/docker-compose.cloudflared.yml` to token mode; the tunnel token lives only
  in `/etc/buildkart/secrets/cloudflared.env` (mode 600) and is not committed.

Group membership currently uses staging test identities:

- Staff: `gobazarbee@gmail.com`, email domain `gobazarbee.com`
- Sellers: `owner.seller01`, `orders.seller01`, `catalog.seller01`, `owner.seller02`,
  `orders.seller02` at `buildkart.test`
- ERP: `erp.ops01`, `finance.ops01`, `superadmin01` at `buildkart.test`

## 2. Verification

| Check | Result |
|---|---|
| `/dashboard` without a session | `302` → `bazarbee.cloudflareaccess.com` |
| `/seller` without a session | `302` → Access (Seller app) |
| `/erp/` without a session | `302` → Access (ERP app) |
| Access login page | email one-time PIN form |
| Admin through tunnel | `200` |
| Seller through tunnel | `200` |
| ERP through tunnel | `200` |
| COD page through tunnel | `200` |
| `gobazarbee.com` | `200` with `cf-ray` |
| `api-staging` / `app-staging` | `200`, outside Access |
| old `ops-staging.../dashboard` | `503`, no admin bypass |

The origin test used a temporary service token. It was deleted after verification, together with its
`non_identity` policies; `GET /access/service_tokens` now returns an empty list.

## 3. Blocked / next actions

1. Add Google Workspace or Entra as the IdP and map the three groups to directory groups. Needs the
   customer's IdP tenant and group names.
2. Restrict the origin firewall to Cloudflare ranges; no public origin port for ops.
3. Enable WAF managed rules and rate limiting on the ops paths.
4. Verify `Cf-Access-Jwt-Assertion` at the origin for defence in depth.
5. Create the same three applications, groups and tunnel in the production Cloudflare setup.
6. Rotate the staging admin password (currently `supersecret`).

## 4. Security note

The API token from the Desktop file was used only for account/zone/Access/tunnel setup. It was not
printed or committed. R2 access keys in the same file were not used. No tunnel token, service token
or API token is stored in the repository.
