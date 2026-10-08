# Hosted staging pilot deployment

This package deploys the bounded BuildKart staging pilot behind a Cloudflare Tunnel. It does not
authorize production release. PostgreSQL, Redis, NATS, Tryton, Medusa, worker metrics and the
Experience API have no host-published ports.

## Required host files

Create these root-owned files on the VPS with mode `0600`:

- `/etc/buildkart/secrets/postgres.env`
- `/etc/buildkart/secrets/redis.env`
- `/etc/buildkart/secrets/nats.env`
- `/etc/buildkart/secrets/medusa.env`
- `/etc/buildkart/secrets/tryton.env`
- `/etc/buildkart/secrets/experience-api.env`
- `/etc/buildkart/secrets/firebase-admin.json`
- `/etc/buildkart/cloudflared/config.yml`
- `/etc/buildkart/cloudflared/tunnel-credentials.json`

Use `secrets/experience-api.env.example` only as a field list. Never copy real values into Git.
Keep `FCM_DELIVERY_ENABLED=false` until template wording, tester consent and credentials pass review.
The base Compose file does not mount Firebase credentials. After approval, use both Compose files:

```sh
docker compose -f docker-compose.hosted.yml -f docker-compose.fcm.yml up -d event-workers
```

## Cloudflare controls

1. Route the customer API hostname and a separate operator hostname through the Tunnel.
2. Put the entire operator hostname behind Cloudflare Access with named operator identities and MFA.
3. Keep the customer hostname outside Access, but apply rate limiting/WAF rules.
4. The nginx policy independently returns `404` for privileged paths on the customer hostname.
5. Do not create public DNS records or firewall openings for any container port.

## Bring-up

```sh
cd services/hosted
export PUBLIC_API_HOSTNAME=api-staging.example.com
docker compose -f docker-compose.hosted.yml config
docker compose -f docker-compose.hosted.yml build
docker compose -f docker-compose.hosted.yml up -d postgres redis nats
docker compose -f docker-compose.hosted.yml up medusa-migrate
docker compose -f docker-compose.hosted.yml up -d
docker compose -f docker-compose.hosted.yml ps
```

Verify health through the Tunnel, then verify that the customer hostname returns `404` for
`/metrics`, `/ops`, `/v1/admin/*`, `/v1/ops/*`, payment simulation and shipment advancement.

## Backups

Install `age`, place the backup recipient in `/etc/buildkart/backup-age-recipient`, and run
`scripts/backup-postgres.sh` from a root-owned timer. A backup is not accepted until
`scripts/restore-proof.sh` succeeds against a throwaway database.
