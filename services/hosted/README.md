# Hosted staging pilot deployment

This package deploys the bounded BuildKart staging pilot. It does not authorize production release.
PostgreSQL, Redis, NATS, Tryton, Medusa, worker metrics and the Experience API have no
host-published ports; only the internal `proxy` (nginx) is reachable from the edge.

## Edge topology

The active edge is the **existing Coolify Traefik** on :80/:443 (Let's Encrypt), because
`pinakaplay.cloud` uses Hostinger nameservers with direct `A` records to the VPS. The `proxy`
service joins the external `coolify` network and is routed by Traefik labels for two hostnames:

| Host | Variable | Purpose |
|---|---|---|
| `api-staging.pinakaplay.cloud` | `PUBLIC_API_HOSTNAME` | Customer API (privileged paths return `404`) |
| `ops-staging.pinakaplay.cloud` | `PUBLIC_OPS_HOSTNAME` | Operator API + `/ops` console (app RBAC) |

A Cloudflare Tunnel edge is **optional and inactive**; it only works if the zone's nameservers are
moved to Cloudflare and the hostnames become proxied CNAMEs to the tunnel. See
`docker-compose.cloudflared.yml`. The operator hostname is protected by application RBAC (CHG-019);
the approved Cloudflare Access layer is **deferred** and tracked as a hardening gap.

## Operator / admin console

The operator hostname also serves the Mercur **admin** and **vendor** dashboards and the Medusa
admin/auth APIs, routed by nginx to `medusa-api`:

| Path | Surface |
|---|---|
| `/dashboard/` | Mercur admin dashboard (Medusa/Mercur operators) |
| `/seller/` | Mercur vendor (seller) dashboard |
| `/admin/*`, `/auth/*`, `/vendor/*`, `/static/*` | Medusa admin/auth/vendor APIs and uploads |

The customer hostname returns `404` for all of these. The dashboards are bundled into the backend
image at build time with the correct asset base — see `services/backend/Dockerfile`: the panels are
built with **npm/Node**, not turbo, because turbo runs scripts under Bun and the Mercur dashboard SDK
loads `medusa-config.ts` via `esbuild-register` + `require`, which Bun rejects (that made the panels
fall back to base `/` and 404 their assets).

The admin account is created on the host with the bundled Medusa CLI and stored at
`/etc/buildkart/secrets/admin-console.txt`:

```sh
docker compose -f docker-compose.hosted.yml exec -T medusa-api \
  /app/packages/api/node_modules/.bin/medusa user -e admin@buildkart.test -p '<password>'
```

Until Cloudflare Access is in place, the admin console is protected only by its own login over TLS.
Treat this as a pilot-only exposure.

## Required host files

Create these root-owned files on the VPS with mode `0600`:

- `/etc/buildkart/secrets/postgres.env`
- `/etc/buildkart/secrets/redis.env`
- `/etc/buildkart/secrets/nats.env`
- `/etc/buildkart/secrets/medusa.env`
- `/etc/buildkart/secrets/tryton.env`
- `/etc/buildkart/secrets/experience-api.env`
- `/etc/buildkart/secrets/firebase-admin.json`  (only when enabling FCM)

Use `secrets/*.env.example` only as a field list. Never copy real values into Git.
Keep `FCM_DELIVERY_ENABLED=false` until template wording, tester consent and credentials pass review.
The base Compose file does not mount Firebase credentials. After approval:

```sh
docker compose -f docker-compose.hosted.yml -f docker-compose.fcm.yml up -d event-workers
```

## Bring-up

Provide the two hostnames (for example in a `.env` next to this file) and start the stack:

```sh
cd services/hosted
export PUBLIC_API_HOSTNAME=api-staging.example.com
export PUBLIC_OPS_HOSTNAME=ops-staging.example.com
docker compose -f docker-compose.hosted.yml config
docker compose -f docker-compose.hosted.yml build
docker compose -f docker-compose.hosted.yml up -d postgres redis nats
docker compose -f docker-compose.hosted.yml up medusa-migrate
docker compose -f docker-compose.hosted.yml up -d
docker compose -f docker-compose.hosted.yml ps
```

Traefik discovers the `proxy` by label and issues certificates automatically. Verify TLS, then verify
that the **customer** hostname returns `404` for `/metrics`, `/ops`, `/v1/admin/*`, `/v1/ops/*`,
payment simulation and shipment advancement, while the operator hostname reaches them.

## Post-deploy acceptance gate

Run the automated hosted acceptance checklist against the deployed staging endpoint before any
tester wave:

```sh
cd services/experience-api
EXPERIENCE_BASE_URL=https://api-staging.example.com bun run test:acceptance
```

It verifies: reachable health with a connected identity store and simulated payment; unknown identity
`403`; server-owned customer context; privileged routes denied to customers and allowed to an
operator; owner-scoped notification inbox; device registration/removal; logout revocation; and that
the deployment still reports `production_release_authorized: false`. It fails closed on any miss.

## Seed data (staging demo)

Two helper scripts run against the deployed API and are safe to re-run:

```sh
# Create orders through the real checkout flow (cart -> line -> address -> shipping -> complete)
# usage: bun seed-orders.ts <count> <customerEmail> <sellerName>
bun services/hosted/scripts/seed-orders.ts 20 rsoni001@gmail.com "BuildMaster Supplies"

# Sync offer SKUs to Tryton and create ERP reservations for the seeded carts
bun services/hosted/scripts/populate-tryton.ts carts.json
```

`seed-orders.ts` authenticates as a pilot customer (OTP `123456`), so orders are canonical and
allocated to the chosen seller. To vary history, the operator can backdate `order.created_at` and
`order_summary.created_at` (staging dummy data only).

## Backups

Install `age`, place the backup recipient in `/etc/buildkart/backup-age-recipient`, and run
`scripts/backup-postgres.sh` from a root-owned timer. A backup is not accepted until
`scripts/restore-proof.sh` succeeds against a throwaway database.
