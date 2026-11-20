# Cloudflare Access provisioning — 2026-11-21

Status: **live on staging** · `ops.gobazarbee.com` is fully behind one Access app · WAF, rate limit
and origin lock are active · Google Workspace/Entra IdP and production remain open.

## 1. Completed

### Edge and DNS

- Zero Trust enabled; team domain `bazarbee.cloudflareaccess.com`.
- Zone `gobazarbee.com` active on Cloudflare nameservers; Universal SSL issued; SSL mode `strict`.
- DNS:
  - `A @` and `A www` → `89.116.20.164`, proxied
  - `CNAME ops` → `5f501407-06a2-4f54-9e35-7362705285d7.cfargotunnel.com`, proxied
  - Google site-verification TXT, DNS only
- Tunnel `bazarbee-ops` runs as `buildkart-hosted-pilot-cloudflared-1`; ingress
  `ops.gobazarbee.com` → `http://buildkart-hosted-pilot-proxy-1:8080`.
- `PUBLIC_OPS_HOSTNAME=ops.gobazarbee.com`; old `ops-staging.pinakaplay.cloud` operator routes
  retired.

### Access

```text
BazarBee Ops   5e060aec-bbff-4f9c-8d81-63c7a887b276  ops.gobazarbee.com  8h
```

- One host-level app, policy allows Staff **or** Sellers **or** ERP.
- Groups:

```text
BazarBee Staff    8402ec6c-94db-4b02-ae31-4af4e2886f97
BazarBee Sellers  526ab49c-3701-49e8-aa43-7c5d4bd1bbb0
BazarBee ERP      5ce76749-9f8e-46b2-bb52-2ff6804c79d8
```

- One-time PIN IdP `abbf6c39-c8e7-446e-a3c1-05ae508d144f`; no external IdP yet.
- The previous path-scoped apps (Admin, Seller, ERP) were deleted after the host app passed.

### Protection

- **WAF**: Cloudflare Managed Free Ruleset enabled (entrypoint `998f3830fd8c43ca88e503812ba6d6dc`).
- **Rate limit**: rule `c602bc4b9866462aacb5b9e0f1673d05`
  - 120 requests / 10 s per IP per colo on `/dashboard`, `/seller`, `/erp`, `/admin`, `/auth`,
    `/v1/ops`, `/v1/admin`, `/metrics`
  - 10 s block (free-plan maximum window and mitigation).
- **Origin lock**: transform rule `09aea3be48734319a6a166c618965f37` sets `X-Bazarbee-Edge` for
  `ops.gobazarbee.com`. nginx compares it against `EDGE_SHARED_SECRET` from
  `/etc/buildkart/secrets/edge.env` and returns `403` when missing.
- `services/hosted/docker-compose.hosted.yml` always attaches the proxy to the `tunnel` network.
- The tunnel token lives only in `/etc/buildkart/secrets/cloudflared.env` (600). The edge secret
  lives only in `/etc/buildkart/secrets/edge.env` (600). Neither is committed.

## 2. Verification

| Check | Result |
|---|---|
| All ops paths without a session | `302` to the same Access app |
| Origin, ops Host, no edge header | `403` |
| Origin, ops Host, edge header | `200` |
| Direct VPS IP with spoofed ops Host | `403` |
| Through Cloudflare with a token | `/dashboard/login` `200`, `/health` `200`, `/v1/ops/audit` `401` |
| `gobazarbee.com` | `200` |
| `api-staging` / `app-staging` | `200` |
| Old ops-staging host | `503` |
| Standing service tokens after test | none |

The end-to-end check used a one-hour service token and a temporary `non_identity` policy; both were
deleted.

## 3. Open

1. Google Workspace or Entra IdP is **not required**; the accepted alternative is the
   superadmin-maintained staff list plus TOTP (`docs/architecture/identity-ops-totp-2026-11-21.md`).
   One-time PIN is factor 1 only and is not MFA.
2. Production apps/groups/tunnel on `ops.gobazarbee.com` — blocked by `D-020-12`. Staging must move
   to `ops.staging.gobazarbee.com` (or `ops-staging.pinakaplay.cloud`) before the apex zone transfers.
3. External health monitoring must use a scoped service token (or an internal probe) because
   `/health` is behind Access.
4. Network-level origin restriction (80/443 to Cloudflare ranges) waits for the customer/API/app
   hosts to move onto Cloudflare.
5. Rotate the staging admin password (`admin@buildkart.test / supersecret`).

## 4. Security note

The Cloudflare API token from the Desktop file was used only for account/zone/Access/tunnel/ruleset
setup. It was not printed or committed. R2 access keys in the same file were not used.
