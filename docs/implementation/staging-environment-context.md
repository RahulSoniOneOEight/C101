# Staging environment context — BuildKart / C101

Date: 2026-10-23
Audience: OpenCode tabs working on the BuildKart staging release.

## Purpose

This note gives the project and staging context without putting credentials in Git. The matching
local-only credential file is:

- `C:\Users\LENOVO\.buildkart\staging-access.txt`
- `C:\Users\LENOVO\Desktop\BuildKart_Staging_Access.txt`

Those files are outside the repository, are not committed, and contain the current staging admin
credential, service environment values and the requester-provided passkey. Do not copy them into the
repo or paste their contents into chat.

## Repository

- Repo: `C:\Users\LENOVO\C101-commission-statements`
- Branch: `feat/order-detail-workbench`
- Remote: `origin/feat/order-detail-workbench`
- Runtime release: `/opt/buildkart-releases/release-950f454`
- Runtime commit: `950f454`
- Docs-only HEAD: branch HEAD after this record (not part of the runtime release)
- Production release: not authorized

## Public staging URLs

| Surface | URL |
|---|---|
| Admin | `https://ops-staging.pinakaplay.cloud/dashboard/` |
| Seller | `https://ops-staging.pinakaplay.cloud/seller/` |
| Customer API | `https://api-staging.pinakaplay.cloud` |
| Tryton ERP | `https://ops-staging.pinakaplay.cloud/erp/` |

## Host and services

- Staging host: `89.116.20.164`
- SSH: `ssh -i ~/.ssh/buildkart_deploy root@89.116.20.164`
- Deployment root: `/opt/buildkart-releases/`
- Current symlink: `/opt/buildkart-releases/current`
- Compose directory: `/opt/buildkart-releases/current/services/hosted`
- Mutable operator checkout (do not deploy from it): `/opt/buildkart`

Service layout:

| Service | Role |
|---|---|
| `medusa-api` | Mercur/Medusa backend and bundled Admin/Seller dashboards |
| `medusa-worker` | Medusa workers |
| `experience-api` | BuildKart Experience API |
| `event-workers` | NATS consumers |
| `postgres` | `buildkart`, `buildkart_experience`, `buildkart_tryton`, `buildkart_cms` |
| `redis` | Medusa cache/queue/locking |
| `nats` | Cross-system JetStream events |
| `tryton` | ERP |
| `cms` | Strapi editorial service |
| `workspace` | Collaborative workspace service |
| `proxy` | nginx edge behind the host Traefik |

Container names are `buildkart-hosted-pilot-*`.

## Credentials

Use the local-only file above. It contains:

- staging admin console email/password
- PostgreSQL, Redis, NATS, Medusa, Experience API, Tryton and CMS environment values
- the requester-provided passkey `1234` (recorded as supplied, not verified as a service credential)

Seller logins use the staging seed accounts:

- `urbanbuild@mercur.dev`
- `buildmaster@mercur.dev`
- `powermax@mercur.dev`
- `catalogue@buildkart.test` (BuildKart Direct)

The pilot OTP is configured in `/etc/buildkart/secrets/experience-api.env` on the host. Use the value
there; do not assume the four-digit passkey is the OTP.

Admin password source on the host:

`/etc/buildkart/secrets/admin-console.txt`

Do not commit any of these values. The staging admin password was exposed in an earlier diagnostic
output; rotate it before widening access.

## Deploying a new release

Use an immutable worktree, never the mutable `/opt/buildkart` checkout.

```sh
ssh -i ~/.ssh/buildkart_deploy root@89.116.20.164
cd /opt/buildkart
git fetch origin feat/order-detail-workbench
git worktree add --detach /opt/buildkart-releases/release-<sha> <sha>
cp /opt/buildkart-releases/current/services/hosted/.env \
  /opt/buildkart-releases/release-<sha>/services/hosted/.env
cd /opt/buildkart-releases/release-<sha>/services/hosted
docker compose -f docker-compose.hosted.yml build \
  medusa-api medusa-worker experience-api event-workers
ln -sfn /opt/buildkart-releases/release-<sha> /opt/buildkart-releases/current
docker compose -f docker-compose.hosted.yml up -d \
  medusa-api medusa-worker experience-api event-workers
docker restart buildkart-hosted-pilot-proxy-1
```

Run `docker compose -f docker-compose.hosted.yml run --rm medusa-migrate` when Medusa schema or
dependency changes are included. Experience API schema changes require a clone rehearsal before
applying to staging.

Always restart the proxy after recreating API containers; otherwise nginx may keep stale container
IPs and return `502` even while containers are healthy.

## Verification

```sh
curl -fsS https://api-staging.pinakaplay.cloud/health
curl -fsS https://ops-staging.pinakaplay.cloud/health
curl -fsS https://ops-staging.pinakaplay.cloud/dashboard/
curl -fsS https://ops-staging.pinakaplay.cloud/seller/
```

Hosted acceptance uses host networking because the container cannot resolve the public hostname:

```sh
ssh -i ~/.ssh/buildkart_deploy root@89.116.20.164 \
  "docker run --rm --network host \
    --env-file /etc/buildkart/secrets/experience-api.env \
    -e EXPERIENCE_BASE_URL=https://api-staging.pinakaplay.cloud \
    -e EXPERIENCE_OPS_BASE_URL=https://ops-staging.pinakaplay.cloud \
    buildkart-hosted-pilot-experience-api \
    bun run src/scripts/hosted-acceptance.ts"
```

Expected: `11/11 acceptance checks passed`.

## Current order-page scope

The Admin/Seller order page contains only:

- Delivery
- Returns
- Activity
- collapsed System references

Delivery statuses: **Dispatched, In Transit, Out For Delivery, Delivered**.
Return statuses: **Schedule Return, Waiting For Pickup, Return Completed**.

Removed: Operational status tiles, staging banner, Technical details, terminal delivery update
controls.

Delivery applies to the seller shipment/allocation. Selected-SKU status is deferred until a
line-level status contract is supplied. Payment/refund remain the native Medusa flows; do not add
manual payment/refund status controls without an explicit vocabulary.

## Current staging test data

- Order `#109`: `order_01M5KZ7AXK08HZR3AVK3CCSJ82`
  - Order group: `og_01M5KZ7AY4T0ATRR115B84YC8W`
  - UrbanBuild shipment: delivered v5, 5/5
  - PowerMax shipment: delivered v5, 4/4
  - BuildKart Direct shipment: booked v1, 1 unit
- Return order `#91`: `order_01M5EWVP2CE3JBHFGBZZCAZXCW`
  - Return `ret_40f91bfa75174d85bf72c92788716427`: received v4, displayed as **Return Completed**

These are staging/test records only.

## Working rules

- Do not add UI items, statuses, fields or banners that were not explicitly supplied.
- Do not reintroduce operational tiles, staging banners or Technical details.
- Do not run local DB/HTTP tests against staging.
- Do not deploy from `/opt/buildkart`.
- Do not commit secrets or copy `/etc/buildkart/secrets/*` into the repo.
- Production remains unauthorized.

## Open items

- Selected-SKU delivery status (line-level contract not supplied).
- Manual payment/refund status vocabulary (native Medusa flows remain).
- Real carrier integration (separate governed change; carrier automation disabled).
- Staging admin credential rotation.
- Production release.
