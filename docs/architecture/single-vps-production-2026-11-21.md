# BazarBee - single-VPS production and staging promotion

Date: 2026-11-21
Constraint: run the entire project on one VPS and promote staging to production.
Status: plan only. Production remains blocked by `D-020-12` and the production credentials.

## 1. Decision

A single VPS is accepted as the **launch** topology. It is not highly available. The host is a
single point of failure, and production and staging must not share the same Docker project or
volumes.

Recommended shape:

```text
one VPS
  production Compose project   <- public traffic
  staging Compose project      <- stopped by default, started for change windows only
  one Cloudflare Tunnel per environment (or one tunnel with host-based ingress)
  backups and monitoring
```

If staging must stay online continuously, the host needs enough RAM for both and the security
boundary is weaker. For launch, keep staging **stopped** outside change windows.

## 2. What "promote staging" should mean

Do **not** rename the live staging stack and call it production. That carries test identities,
staging secrets and an unclear rollback.

Recommended: a **parallel production project on the same VPS**.

- new Compose project name, networks, volumes and databases
- fresh production secrets
- approved master data imported from a sanitized staging dump
- staging stopped but kept intact for rollback
- cutover by DNS/tunnel, not by mutating the running stack

An in-place promotion is possible but riskier; the runbook is in section 8.

## 3. Target layout on the VPS

```text
/opt/bazarbee-production/
  docker-compose.yml
  .env                        # non-secret hostnames and flags
  nginx.conf.template
  secrets/                    # mounted read-only, 600

Docker networks:
  bazarbee-prod_edge          # proxy + cloudflared
  bazarbee-prod_app           # proxy + app services
  bazarbee-prod_data          # app + postgres/redis/nats (internal)

Volumes:
  bazarbee-prod_postgres
  bazarbee-prod_redis
  bazarbee-prod_nats
  bazarbee-prod_uploads
  bazarbee-prod_evidence
  bazarbee-prod_cms
```

Public entry:

```text
Cloudflare (production account)
  DNS | WAF | Access | rate limits
        |
  Cloudflare Tunnel bazarbee-prod
        |
  nginx proxy  -> medusa-api / experience-api / web / workspace / cms / tryton
```

No public `80/443` on the host. The tunnel connector is outbound-only. Keep SSH open from named
administrator IPs only.

Services on the host:

```text
proxy, cloudflared
medusa-api, medusa-worker
experience-api, event-workers
web, workspace, cms, tryton
postgres, redis, nats
```

Do not run Coolify or preview environments in production. If Coolify is kept for staging, put it
behind Access/VPN and close `8000/6001/6002`.

## 4. Resource budget

Current host: 4 vCPU, 15 GiB RAM, 193 GB disk, no swap.

| Workload | Estimate |
|---|---|
| Production stack | 3-5 GiB |
| Staging stack (when running) | 3-4 GiB |
| Coolify + preview (remove) | 1-2 GiB |
| OS, Docker, page cache | 2-3 GiB |

At launch, production alone fits comfortably. Add **4 GB swap** and container memory limits. If
staging must run continuously alongside production, 16 GiB is the minimum and 32 GiB is safer.

Disk: production data is small today (under 150 MB of databases). Images and releases consume most
space. Keep 50 GB free for logs, backups and image pulls; prune old releases monthly.

## 5. Host hardening

- [ ] UFW/nftables default deny; SSH only from admin IPs; no public 80/443/8000/6001/6002
- [ ] SSH key-only, `PermitRootLogin prohibit-password`, `PasswordAuthentication no`
- [ ] fail2ban or equivalent
- [ ] 4 GB swap
- [ ] unattended security updates; monthly full patch
- [ ] Docker log rotation (`max-size=50m`, `max-file=5`) and container memory limits
- [ ] remove Coolify and the u009 preview stack from production
- [ ] provider snapshot enabled
- [ ] production secrets mode 600, owned by root, backed up separately
- [ ] no shared bootstrap admin; named Mercur accounts and a dedicated invite service admin

## 6. Data and backups on one host

Single-host production needs offsite backups more than a multi-host setup.

| Data | Method | Target |
|---|---|---|
| PostgreSQL | nightly `pg_dump` + optional WAL archive (`pgBackRest`/`wal-g`) | R2/S3, encrypted |
| Uploads/evidence/CMS media | R2/S3 primary, or nightly volume archive | R2/S3 |
| Redis | AOF/RDB snapshot | R2/S3 |
| NATS JetStream | stream backup or accept rebuild | R2/S3 |
| Secrets/config | encrypted archive | secret manager / offline |
| Images | registry retention | rollback by digest |

Minimum launch target:

```text
RPO 24 h with nightly dumps; 15 min if WAL archiving is enabled
RTO 2-4 h: rebuild host, restore databases and volumes, start Compose
```

Controls:

- backup timer must alert on failure
- restore one database monthly
- keep 7 daily, 4 weekly, 3 monthly copies
- test a full host rebuild once before launch

## 7. Promotion runbook - parallel project

### Phase 0 - freeze and authorize

- [ ] `D-020-12` approved for the exact tag and image digests
- [ ] staging writes frozen; final backup taken
- [ ] production domain and Cloudflare account ready

### Phase 1 - backups

- [ ] `pg_dump` every database
- [ ] archive uploads, evidence, CMS media, Redis/NATS if needed
- [ ] archive the staging secrets and compose files
- [ ] upload encrypted copies to R2
- [ ] restore one database into a scratch DB and verify row counts

### Phase 2 - production secrets and data

- [ ] new database passwords, JWT/cookie secrets, Razorpay live keys, Resend key
- [ ] new `OPS_TOTP_ENCRYPTION_KEY`, `EDGE_SHARED_SECRET`, tunnel token, Access AUD
- [ ] create empty production databases
- [ ] import approved master data only: catalogue, sellers, CMS, shipping options, service zones,
      COD policies
- [ ] exclude staging customers, orders, carts, staff and audit rows
- [ ] verify no `@buildkart.test` identity or test order remains

### Phase 3 - deploy

- [ ] create `/opt/bazarbee-production` with the production Compose file and networks
- [ ] start postgres/redis/nats; run migrations
- [ ] start the stack with `OPS_TOTP_GATE=shadow`
- [ ] seed the two production superadmins
- [ ] enrol them at `/ops/enroll`; create the rest through `/ops/staff`
- [ ] smoke test web, API, admin, seller, ERP and the payment sandbox

### Phase 4 - cutover

- [ ] create the production Cloudflare tunnel and Access app
- [ ] point `gobazarbee.com`, `api.gobazarbee.com`, `app.gobazarbee.com`, `ops.gobazarbee.com`
- [ ] verify TLS, WAF, rate limits and the origin lock
- [ ] switch Razorpay to live only after the payment smoke test
- [ ] run the UAT matrix; set `OPS_TOTP_GATE=enforce`
- [ ] announce

### Phase 5 - rollback window

- [ ] keep staging stopped but intact for 7-14 days
- [ ] rollback = repoint DNS/tunnel to staging + restore the last backup
- [ ] after the window, decommission or keep staging only for change windows

## 8. In-place promotion variant

Only if a parallel project is not possible:

1. Stop all staging writers.
2. Snapshot the provider disk and dump every database.
3. Clean test identities, orders, carts and audit rows.
4. Rotate every secret.
5. Change `BUILDKART_ENVIRONMENT=production`, `IDENTITY_MODE=directory`,
   `PAYMENT_ADAPTER_MODE=provider`, production hostnames and Cloudflare credentials.
6. Recreate the stack with a production project name and new volumes only if possible.
7. Keep the old volumes untouched for rollback.
8. Run migrations, smoke tests, UAT and enforce.

Risk: a failed migration or secret change mutates the only copy. The snapshot is the rollback.

## 9. Cutover checklist

- [ ] production Cloudflare account, zone, team domain, Access app, groups and tunnel
- [ ] `gobazarbee.com` zone transferred; `staging.pinakaplay.cloud` stays separate
- [ ] no public 80/443; tunnel only
- [ ] production secrets unique; staging secrets not reused
- [ ] no staging data, test identities or shared admin password
- [ ] backups uploaded and restored once
- [ ] monitoring and alerts live
- [ ] `ops` gate in `shadow`, then `enforce`
- [ ] Razorpay live keys and webhook verified
- [ ] Flutter production build points to `api.gobazarbee.com`
- [ ] rollback tested
- [ ] `D-020-12` recorded

## 10. Accepted risks for a single VPS

| Risk | Mitigation |
|---|---|
| Host/disk/network failure | provider snapshot, offsite backups, 2-4 h rebuild runbook |
| No HA during deploy | maintenance window, keep previous image digests, fast rollback |
| Production and staging share a Docker host | staging stopped outside change windows; separate projects/networks/volumes |
| Resource contention | memory limits, swap, monitoring, no preview/Coolify in production |
| One security boundary | firewall, no public management ports, patching, Cloudflare Access |
| Backup loss | encrypted offsite copies + monthly restore test |

This is acceptable for launch only with the controls above. Plan a second host for HA when traffic or
uptime requirements justify it.

## 11. Blockers and decisions

- `D-020-12` release authorization
- production Cloudflare account and `gobazarbee.com` zone transfer
- live Razorpay keys and webhook
- production Resend sender
- production superadmin emails and Mercur service admin
- whether staging stays on the same VPS (stopped) or moves to a second host
- RPO/RTO approval

Until those are supplied, production remains untouched.
