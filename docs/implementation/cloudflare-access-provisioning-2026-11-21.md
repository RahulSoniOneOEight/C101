# Cloudflare Access provisioning - 2026-11-21

Status: **live on staging** at `ops-staging.pinakaplay.cloud` · whole host behind one Access app ·
WAF, rate limit and origin lock active · production `ops.gobazarbee.com` remains separate and
untouched.

## 1. Completed

### Edge and DNS

- Zero Trust enabled; team domain `bazarbee.cloudflareaccess.com`.
- Staging zone moved to `pinakaplay.cloud` (`8b1df862067f5271b82c42ea9fe38b46`), nameservers
  `jillian.ns.cloudflare.com` / `odin.ns.cloudflare.com`, status **active**; Universal SSL active.
- DNS records:
  - `A @` -> `2.57.91.91`, DNS only
  - `CNAME www` -> `pinakaplay.cloud`, DNS only
  - `A api-staging` / `app-staging` / `coolify` -> `89.116.20.164`, DNS only
  - `CNAME staging` -> `5f501407-...cfargotunnel.com`, proxied
  - `CNAME ops-staging` -> `5f501407-...cfargotunnel.com`, proxied
- Tunnel `bazarbee-ops` runs as `buildkart-hosted-pilot-cloudflared-1`; ingress
  `ops-staging.pinakaplay.cloud` and `staging.pinakaplay.cloud` -> the proxy.
- `PUBLIC_APP_HOSTNAME=staging.pinakaplay.cloud`,
  `PUBLIC_OPS_HOSTNAME=ops-staging.pinakaplay.cloud`,
  `AUTH_EMAIL_LINK_BASE_URL=https://staging.pinakaplay.cloud`.
- The old `ops.gobazarbee.com` Access app, DNS record and tunnel ingress were removed. The
  `gobazarbee.com` staging web is retired; the apex zone is reserved for production.

### Access

```text
BazarBee Ops (staging)   10bf06de-f005-44db-8bb6-de14ea6c9c6c
                          ops-staging.pinakaplay.cloud   8h
AUD                      5349b42a37b60700201b76240a53bde675ade178a98a5f65ad33f96303ace1ab
```

- One host-level app, policy allows Staff **or** Sellers **or** ERP.
- Groups:

```text
BazarBee Staff    8402ec6c-94db-4b02-ae31-4af4e2886f97
BazarBee Sellers  526ab49c-3701-49e8-aa43-7c5d4bd1bbb0
BazarBee ERP      5ce76749-9f8e-46b2-bb52-2ff6804c79d8
```

- One-time PIN IdP `abbf6c39-c8e7-446e-a3c1-05ae508d144f`; no external IdP.
- `OPS_ACCESS_AUDIENCE` on the Experience API is the new AUD above.

### Protection

- **WAF**: Cloudflare Managed Free Ruleset on `pinakaplay.cloud`
  (entrypoint `ed816d8291f14f979ba806eaaa550f7b`).
- **Rate limit**: rule `ded6da1f587c46938e848e55bc3b0b59`
  - 120 requests / 10 s per IP per colo on `/dashboard`, `/admin`, `/auth`, `/v1/ops`,
    `/v1/admin`, `/metrics`
  - 10 s block (free-plan maximum window and mitigation).
- **Origin lock**: transform rule `25beee8ad5db4be0b8c91c57a1f46875` sets `X-Bazarbee-Edge` for
  `ops-staging.pinakaplay.cloud`. nginx compares it against `EDGE_SHARED_SECRET` from
  `/etc/buildkart/secrets/edge.env` and returns `403` when missing.
- `services/hosted/docker-compose.hosted.yml` always attaches the proxy to the `tunnel` network.
- The tunnel token lives only in `/etc/buildkart/secrets/cloudflared.env` (600). The edge secret
  lives only in `/etc/buildkart/secrets/edge.env` (600). Neither is committed.

## 2. Verification

| Check | Result |
|---|---|
| `staging.pinakaplay.cloud` | `200` |
| `ops-staging.pinakaplay.cloud/dashboard` | `302` to Access, `kid` `5349...` |
| `/ops/enroll` | `302` to Access |
| Origin, ops Host, no edge header | `403` |
| Origin, ops Host, edge header | `200` |
| Through Cloudflare with a token | `/dashboard/login` `200`, `/dashboard/cod` `200`, `/v1/ops/audit` `401` |
| `api-staging` / `app-staging` | `200` |
| Old `ops.gobazarbee.com` | removed (DNS + app + tunnel route) |
| Old `gobazarbee.com` staging web | `404`; zone reserved for production |
| Standing service tokens after test | none |

The end-to-end check used a one-hour service token and a temporary `non_identity` policy; both were
deleted.

## 3. Open

1. Production Cloudflare account, zone, tunnel, app and groups on `ops.gobazarbee.com` — blocked by
   `D-020-12` and the production environment.
2. Google Workspace/Entra is not required; the accepted alternative is the staff list + TOTP
   (`docs/architecture/identity-ops-totp-2026-11-21.md`). One-time PIN is factor 1 only.
3. External health monitoring must use a scoped service token (or an internal probe) because
   `/health` is behind Access.
4. Network-level origin restriction (80/443 to Cloudflare ranges) waits for the customer/API/app
   hosts to move onto Cloudflare.
5. Rotate the staging admin password (`admin@buildkart.test / supersecret`).

## 4. Security note

The Cloudflare API token from the Desktop file was used only for account/zone/Access/tunnel/ruleset
setup. It was not printed or committed. R2 access keys in the same file were not used.
