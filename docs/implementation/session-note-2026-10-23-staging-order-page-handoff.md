# Staging handoff — order-page delivery/return UI

Date: 2026-10-23
Branch: `feat/order-detail-workbench`
Purpose: let another OpenCode tab continue work against the live staging release without re-discovering deployment details.

Broader project/service context: `docs/implementation/staging-environment-context.md`.
Local-only credentials: `C:\Users\LENOVO\.buildkart\staging-access.txt` or
`C:\Users\LENOVO\Desktop\BuildKart_Staging_Access.txt` (never commit).

## Current state

| Item | Value |
|---|---|
| Runtime release | `/opt/buildkart-releases/release-9cceaae` |
| Runtime commit | `9cceaae` |
| Branch HEAD | `9cceaae` + docs-only record commit |
| Remote branch | `origin/feat/order-detail-workbench` |
| Staging host | `root@89.116.20.164` |
| SSH key | `~/.ssh/buildkart_deploy` |
| Admin | `https://ops-staging.pinakaplay.cloud/dashboard/` |
| Seller | `https://ops-staging.pinakaplay.cloud/seller/` |
| Customer API | `https://api-staging.pinakaplay.cloud` |
| Production | Not authorized |

Staging is live and healthy. Public health and both dashboards returned `200`; hosted acceptance passed 11/11.

## Credentials

- Admin email: `admin@buildkart.test`
- Admin password: server-side only at `/etc/buildkart/secrets/admin-console.txt` on the staging host.
- Seller logins: `urbanbuild@mercur.dev`, `buildmaster@mercur.dev`, `powermax@mercur.dev` with the staging synthetic password used by the seed.

Do not copy `/etc/buildkart/secrets/*` into Git or chat. The staging admin password was exposed in an earlier diagnostic output; treat it as compromised and rotate it before widening access.

## What is deployed

The order page contains only:

- **Delivery**
- **Returns**
- **Activity**
- Collapsed **System references**

Removed from the order page:

- Operational status tiles
- Staging manual operations banner
- Technical details
- Terminal delivery update controls

Delivery dropdown:

- Dispatched
- In Transit
- Out For Delivery
- Delivered

Return dropdown / labels:

- Schedule Return
- Waiting For Pickup
- Return Completed

The dropdown shows only valid forward transitions. Delivery applies to the seller shipment/allocation. Selected-SKU status is intentionally deferred: no line-level status contract has been supplied.

Payment and refund remain the native Medusa order sections (capture payment/refund actions). The workbench does not duplicate or override payment/refund status.

## Current staging test data

These are staging/test records, not production data.

- Order `#109`: `order_01M5KZ7AXK08HZR3AVK3CCSJ82`
  - Order group: `og_01M5KZ7AY4T0ATRR115B84YC8W`
  - UrbanBuild shipment: delivered v5, 5/5 units
  - PowerMax shipment: delivered v5, 4/4 units
  - BuildKart Direct shipment: booked v1, 1 unit (shows only **Dispatched** in the delivery dropdown)
- Return order `#91`: `order_01M5EWVP2CE3JBHFGBZZCAZXCW`
  - Return `ret_40f91bfa75174d85bf72c92788716427`: received v4, displayed as **Return Completed**
  - No extra return update control is shown

## Deployment pattern

Use immutable release worktrees, not the mutable `/opt/buildkart` checkout.

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

If a change includes a Medusa schema/dependency change, run the migration before recreating the APIs:

```sh
docker compose -f docker-compose.hosted.yml run --rm medusa-migrate
```

For Experience API schema changes, rehearse forward/rollback/re-apply on a cloned database first; do not run destructive rollback against staging.

## Verification

Public checks:

```sh
curl -fsS https://api-staging.pinakaplay.cloud/health
curl -fsS https://ops-staging.pinakaplay.cloud/health
curl -fsS https://ops-staging.pinakaplay.cloud/dashboard/
curl -fsS https://ops-staging.pinakaplay.cloud/seller/
```

Hosted acceptance (the container cannot resolve the public hostname, so use host networking):

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

Local checks before a release:

```sh
cd services/experience-api && bun run typecheck
cd ../backend/packages/api && bunx tsc --noEmit
cd ../../apps/admin && bun run build
cd ../vendor && bun run build
cd ../../../experience-api && bun run test:manual-transitions
bun run test:manual-transitions-db
bun run test:manual-transitions-http
```

The local DB/HTTP tests use the local workspace stack, not staging. Do not point them at staging.

## UI rules for future tabs

- Do not add UI items, statuses, fields or banners that are not explicitly supplied in a document or text.
- Keep the order page simple: Delivery, Returns, Activity, System references.
- Do not reintroduce operational tiles, staging banners or technical details.
- Do not show legacy backend states as order-page options; map them to the supplied labels or hide them.
- Do not add manual payment/refund controls without an explicit status vocabulary.
- Do not claim selected-SKU delivery status until a line-level status contract exists.

## Open items

- Selected-SKU delivery status (needs line-level status contract).
- Manual payment/refund status vocabulary (currently native Medusa flows).
- Real carrier integration (separate governed change; carrier automation disabled).
- Staging admin credential rotation.
- Production release (not authorized).
