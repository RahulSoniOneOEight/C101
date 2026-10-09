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

## ERP web client (Tryton / SAO)

The real Tryton web client (SAO) is served by trytond's built-in web server and routed through the
operator hostname under `/erp/`:

| Item | Value |
|---|---|
| URL | `https://ops-staging.pinakaplay.cloud/erp/` |
| Database | `buildkart_tryton` |
| Login | `admin` (password = `TRYTOND_ADMIN_PASSWORD` in `/etc/buildkart/secrets/tryton.env`) |

How it works:

- `services/tryton/Dockerfile` pins the official `tryton-sao-<version>.tgz` (matching the `trytond`
  series in `requirements.txt`) and installs its runtime `node_modules`.
- `trytond.conf` sets `[web] root = /opt/tryton/sao`, which makes trytond serve `index.html` and
  static assets in addition to JSON-RPC.
- `nginx.conf.template` routes only `/erp/` on the operator hostname to `tryton:8000` and strips the
  prefix. SAO posts to a **relative** `/rpc/` path, so `/erp/rpc/` maps onto trytond's root RPC
  endpoint. The customer hostname 404s `/erp/`.
- The host file `/etc/buildkart/trytond.conf` is bind-mounted over the image config, so it must also
  carry the `[web] root` line.

The ERP UI uses Tryton's own accounts (not the Medusa/Mercur logins) and stays behind the operator
hostname; Cloudflare Access is still deferred, so it is protected only by Tryton's login.

## B2B vs B2C

- The app's B2C and B2B shells are backed by **pilot roles** (`customer` vs `b2b_buyer` /
  `b2b_account_admin` / `b2b_approver`) and **one shared catalogue and seller set** — sellers are
  common to both channels.
- `POST /v1/carts` selects the channel from an explicit `channel` in the body when supplied, else
  from the caller's role, and echoes `channel` and `business_account_id`.
- Medusa's store API allows only **one sales channel per publishable key**, so the B2B/B2C
  distinction is carried as **cart metadata** (`channel`, `business_account_id`). Cart metadata
  propagates to the canonical order, so the marketplace admin can separate B2B from B2C on real
  orders.
- Two Medusa sales channels exist — **B2C Storefront** and **B2B Trade Portal** (all products linked)
  — ready for a stricter per-channel publishable-key split if that is later required.
- B2B-specific commerce (price lists, credit, approvals, MOQ/quantity tiers) is **not yet
  implemented** on the backend; the app's B2B procurement journeys are prototype-level. See CHG-020
  and `docs/architecture/production-readiness-gap-assessment.md`.

### B2B pricing model (staging)

The pricing model is in place and manageable from the admin console:

- **Customer group** `B2B Trade Customers` — the B2B pilot identities (`buyer.b2b01`,
  `buyer.b2b02`, `admin.b2b01`, `approver.b2b01`).
- **Price list** `B2B Trade Pricing` (type `sale`, status `active`) — 52 prices at 90% of list,
  scoped to the group through `rules.customer_group_id` (a price list is scoped to customer groups
  via rules in this Medusa version; there is no `/price-lists/{id}/customer-groups` route).

**Known gap:** the price list is **not yet applied to storefront/cart prices**. Mercur computes each
offer's `calculated_price` from the variant/offer price set and does not surface price-list prices in
its offer projection, so B2B buyers still see list prices. Closing this needs either Mercur pricing
support for price lists or an Experience API-side trade-price overlay resolved from the buyer's
customer group. Tracked as a follow-up.

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
