# BazarBee - VPS review and production architecture

Date: 2026-11-21
Scope: current staging VPS `89.116.20.164` and the recommended production structure.
Status: review and recommendation. Production remains untouched until `D-020-12`.

## 1. Executive summary

The current VPS is a capable **staging** host, not a production host. It runs the full BazarBee
staging stack, Coolify, a preview environment and the Flutter web build on one 4 vCPU / 15 GiB
machine. Resource use is low, but the host is a single point of failure, has no firewall, exposes
Coolify and preview ports publicly, and keeps stateful services on the same box as the applications.

Recommendation:

- keep this VPS as staging (and remove the preview workload)
- build production on a **separate host in a separate provider account/region**
- use **Cloudflare Tunnel** for all public traffic, with no public origin web ports
- use **managed PostgreSQL and Redis** (or a separate data host), and **R2/S3** for uploads
- do not run Coolify or preview environments in production
- deploy immutable images by digest, with backups, monitoring and a restore drill

At launch, one 4 vCPU / 16 GiB app host plus managed data services is enough. Add a second app host
when availability or traffic requires it.

## 2. Measured current VPS

| Item | Value |
|---|---|
| Host | `srv2040286`, KVM, Ubuntu 24.04.5 LTS, kernel 6.8.0-147 |
| CPU | 4 vCPU AMD EPYC 9354P |
| Memory | 15 GiB total; 3.8 GiB used; 11 GiB available |
| Swap | **none** |
| Disk | 193 GB, 21 GB used, 173 GB available |
| Load | 0.79 / 0.91 / 0.95 |
| Uptime | 35 days |
| Docker | 24 containers, 23 active; 17 images (6.6 GB); volumes 495 MB; build cache 1.96 GB |
| Releases | `/opt/buildkart-releases` 7.1 GB; `/var/lib/docker` 9.2 GB |
| OS updates | 23 packages upgradable, 16 held back |

Containers on the host:

```text
staging stack   medusa-api, medusa-worker, experience-api, event-workers, web,
                workspace, cms, tryton, postgres, redis, nats, proxy, cloudflared
extra           coolify, coolify-db, coolify-redis, coolify-sentinel, coolify-proxy
preview         buildkart-u009-preview-api, u009-preview-experience,
                u009-preview-redis, u009-preview-nats
flutter         buildkart-flutter
```

Database sizes are small:

```text
buildkart_u009_preview        40 MB
buildkart                     39 MB
buildkart_tryton              31 MB
buildkart_cms                 14 MB
buildkart_experience_u009     10 MB
buildkart_experience          10 MB
bazarbee_workspace           8.5 MB
```

## 3. Findings

### Critical

| Finding | Why it matters |
|---|---|
| No host firewall (`ufw` inactive) | Every listening service is reachable from the internet unless the provider blocks it |
| Coolify exposed on `8000`, `6001`, `6002` | A management console with Docker control is publicly reachable |
| `PermitRootLogin yes` in `sshd_config` | Root SSH is allowed; password auth config is contradictory across drop-ins |
| Staging, preview and management on one host | A compromise or failure takes everything down; preview code shares the production candidate host |
| Single host, no redundancy | Any disk, host or network failure is a full outage |
| Production not separated | No separate account, secrets, database, DNS zone or Cloudflare account yet |

### High

| Finding | Why it matters |
|---|---|
| PostgreSQL defaults (`shared_buffers` 128 MB) | Underuses 15 GiB; production needs tuning or a managed service |
| Daily logical dumps only | No WAL/PITR; restore loses up to 24 hours |
| Backups stored on the same VPS | Host loss loses the backups too; no offsite copy verified |
| No monitoring or alerting | No uptime, error-rate, backup or certificate alerts |
| No central logs | Container logs are local and rotate with Docker |
| No swap | A memory spike can OOM-kill containers |
| 23 OS packages pending | Unpatched host |
| Shared admin password | `admin@buildkart.test` is used for Mercur and invite automation |
| No container resource limits | One runaway service can starve the host |

### Medium

| Finding | Why it matters |
|---|---|
| 7.1 GB of release directories | Slow to copy, easy to lose track of the active version |
| Build cache 1.96 GB | Reclaimable, not urgent |
| Preview stack running for weeks | Attack surface and memory cost with no owner |
| Coolify and the app stack share the host | Deployment tooling is coupled to runtime |
| Old dumps in `/root` | Unmanaged copies of staging data outside the backup policy |

### Good

- Encrypted daily backups exist: `buildkart-backup.timer` runs at 02:31 and writes age-encrypted
  dumps to `/var/backups/buildkart`.
- Resource use is low; the host has plenty of CPU and disk headroom for staging.
- Docker networks separate `private`, `egress`, `tunnel`, `cms_admin` and `coolify`.
- The operator host is behind Cloudflare Access and a tunnel.
- Secrets live under `/etc/buildkart/secrets` with restricted permissions.

## 4. Recommended production topology

```text
                    Internet
                       |
                 Cloudflare (production account)
                 DNS | WAF | Access | rate limits
                       |
                 Cloudflare Tunnel
                       |
              +--------+---------+
              |  app host (prod) |
              |  nginx edge      |
              |  medusa-api      |
              |  medusa-worker   |
              |  experience-api  |
              |  event-workers   |
              |  web / workspace |
              |  cms / tryton    |
              +--------+---------+
                       |
        +--------------+--------------+
        |              |              |
  Managed Postgres  Managed Redis   NATS (1 or 3)
        |
     PITR + dumps
        |
   R2 / S3 (uploads, evidence, CMS media, backups)
```

Key choices:

- **One public entry:** Cloudflare Tunnel to nginx. No public 80/443 on the origin.
- **Stateful services are not on the app host:** managed PostgreSQL with PITR, managed Redis, object
  storage for uploads/evidence/CMS media.
- **NATS:** single node is acceptable at launch if JetStream data is rebuildable; use 3 nodes when
  order/event durability requires it.
- **No Coolify in production:** deploy from CI with Compose or a small orchestrator.
- **No preview environments in production.**
- **Separate Cloudflare account, zone, team domain, Access app, groups, tunnel and AUD.**

## 5. Sizing

### Launch (first 3-6 months)

| Component | Size | Notes |
|---|---|---|
| App host | 4 vCPU, 16 GiB RAM, 160 GB NVMe | same class as today; runs the stateless stack |
| PostgreSQL | managed, 2 vCPU, 4-8 GiB, 100 GB | PITR, daily snapshots |
| Redis | managed, 1 GiB | sessions, queues, rate limits |
| NATS | 1 small node or managed | JetStream |
| Object storage | R2/S3, pay as used | uploads, evidence, CMS media, backups |
| Cloudflare | Free/Pro | Access, WAF, rate limits, tunnel |

The current stack uses under 4 GiB with staging, Coolify and preview running. A production-only app
host at 16 GiB has substantial headroom; 8 GiB is the minimum acceptable.

### Growth / HA

- two app hosts behind a load balancer or two tunnel connectors
- PostgreSQL primary + replica with automated failover
- Redis with replica/Sentinel or a managed HA instance
- NATS JetStream 3 nodes
- central metrics/logs and on-call alerts

## 6. Network and security baseline

1. **Firewall default deny.** Allow SSH from named IPs only. No public 80/443 when the tunnel is the
   entry. No public Coolify, database, Redis or NATS ports.
2. **SSH:** key-only, `PermitRootLogin prohibit-password`, no password auth, fail2ban or equivalent.
3. **No Coolify on production.** If it must exist, put it on a separate management host behind
   Cloudflare Access/VPN and close 8000/6001/6002.
4. **Cloudflare Access** for admin/seller/ERP; WAF managed rules; rate limits.
5. **Secrets:** a secret manager or Docker secrets. At minimum, 600 files under
   `/etc/buildkart/secrets`, encrypted backup, no secrets in images or git.
6. **Images:** build in CI, scan, pin by digest, run as non-root where possible, read-only root
   filesystems for stateless services.
7. **Patching:** monthly OS and image updates; security patches within 7 days.
8. **Admin passwords:** named accounts, no shared bootstrap password; rotate the staging one.

## 7. Data, backup and recovery

| Data | Backup | Target |
|---|---|---|
| PostgreSQL | managed PITR + nightly logical dump to R2 | RPO 15 min, RTO 1-2 h |
| Uploads / evidence / CMS media | object storage versioning + replication | RPO near zero |
| Redis | rebuildable; snapshot if sessions matter | RTO 15 min |
| NATS JetStream | stream replication or rebuild | RTO 1 h |
| Secrets/config | encrypted backup in the secret manager | RTO 1 h |
| Release images | registry retention | rollback by digest |

Requirements:

- restore drill before launch and quarterly after
- backup success/failure alerts
- documented break-glass and key recovery (TOTP encryption key, Cloudflare token, database)

## 8. Deployment model

```text
CI: test -> build -> scan -> push image by commit/tag
        |
        v
Registry (GHCR/private)
        |
        v
Production host: pull exact digest -> run migration job -> rolling restart
```

- no builds on the production host
- immutable release directories or image digests
- one migration job per release, recorded
- rollback by previous digest; database migrations must be backward compatible
- deploy window and change record for each bundle

## 9. Observability

Minimum:

- uptime checks for web, API, admin, tunnel
- metrics: CPU, memory, disk, container restarts, request rate/latency/5xx, DB connections, queue lag
- logs: structured JSON to a central store with 30-day retention
- alerts: 5xx rate, p95 latency, disk >80%, backup failure, tunnel down, certificate expiry, auth
  failures
- dashboards for order success, payment failures, COD exceptions and ops gate denials

## 10. Migration runbook

1. Choose provider/region and create the production account and host.
2. Harden the host: firewall, SSH, patching, swap, Docker, directories.
3. Provision managed PostgreSQL/Redis and R2 buckets; create empty production databases.
4. Create the production Cloudflare account, zone, team domain, Access app/groups, tunnel and AUD.
5. Store production secrets; never copy staging values.
6. Build and push the release candidate; deploy with `OPS_TOTP_GATE=shadow`.
7. Restore/seed approved master data only; no staging customers, orders or identities.
8. Run smoke tests, backup/restore drill and UAT.
9. Enable `OPS_TOTP_GATE=enforce` after the superadmin enrolment and UAT.
10. Cut DNS to production; keep staging on its own host/zone.
11. Record `D-020-12` with the tag, digests and approvers.

## 11. Immediate staging cleanup (low risk)

- [ ] stop or remove `buildkart-u009-preview-*` and `u009-preview-*` if no longer needed
- [ ] restrict Coolify `8000`, `6001`, `6002` to VPN/Cloudflare Access or localhost
- [ ] enable UFW/nftables: SSH allowlist, 80/443 only Cloudflare or closed behind the tunnel
- [ ] set `PermitRootLogin prohibit-password` and `PasswordAuthentication no`
- [ ] install fail2ban or equivalent
- [ ] apply the 23 pending OS updates
- [ ] add 2-4 GB swap
- [ ] verify offsite backup upload and run one restore test
- [ ] remove old dumps from `/root`
- [ ] set container memory limits
- [ ] rotate `admin@buildkart.test / supersecret`
- [ ] create a dedicated Medusa service admin for invite automation

## 12. Cost sketch

| Item | Monthly (approx.) |
|---|---|
| App host 4 vCPU / 16 GiB | $25-50 |
| Managed PostgreSQL small | $15-35 |
| Managed Redis small | $10-20 |
| R2/S3 storage + egress | $5-15 |
| Monitoring/logs | $0-25 |
| Cloudflare | $0-25 |
| **Total** | **$55-170** |

A second app host and HA database roughly doubles the compute line.

## 13. Decisions needed

1. Provider and region (India or nearest; data residency).
2. Managed PostgreSQL/Redis vs self-hosted on a separate data host.
3. One app host at launch or two for availability.
4. Keep Coolify for staging only, or remove it entirely.
5. RPO/RTO targets to approve.
6. Production domain/account ownership and the `D-020-12` approvers.

Production remains blocked until those are chosen and the release candidate is authorized.
