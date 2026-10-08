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

## Backups

Install `age`, place the backup recipient in `/etc/buildkart/backup-age-recipient`, and run
`scripts/backup-postgres.sh` from a root-owned timer. A backup is not accepted until
`scripts/restore-proof.sh` succeeds against a throwaway database.
