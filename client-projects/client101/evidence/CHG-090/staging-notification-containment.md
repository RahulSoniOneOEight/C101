# CHG-090 — Staging notification delivery containment

Date: 2026-10-29
Status: applied to staging and verified. Production untouched.

## Change

`/etc/buildkart/secrets/experience-api.env`:

```diff
-FCM_DELIVERY_ENABLED=true
+FCM_DELIVERY_ENABLED=false
```

`experience-api` and `event-workers` were recreated from `docker-compose.hosted.yml` (no image
build). The file kept mode `600 root:root`.

Backup: `/var/backups/buildkart/experience-api.env.20261028T200141Z`.

## Why

Staging had external push enabled with invalid Firebase credentials and a pre-existing
dead-letter backlog. No valid credential is available, so disabling the gateway is the safe
containment. In-app notifications are stored independently and keep working.

## Verification

| Check | Result |
|---|---|
| `FCM_DELIVERY_ENABLED` in `experience-api` | `false` |
| `FCM_DELIVERY_ENABLED` in `event-workers` | `false` |
| Worker `/health` | `status: ok`, `fcm_delivery: disabled` |
| Delivery attempts | 29 before, 29 after; last attempt `2026-10-28T13:43:48Z` |
| `experience-api` health | healthy |
| API / app / Admin / Seller | 200 / 200 / 200 / 200 |
| Worker start log | `ready on :9030 (nats=nats://nats:4222, maxDeliver=5)` |

The processor short-circuits when the gateway is null (`if (!this.fcm) continue;`), so no new
delivery-attempt rows are created. Existing dead-letter rows are historical evidence and were left
in place.

## Rollback

```sh
cp -p /var/backups/buildkart/experience-api.env.20261028T200141Z /etc/buildkart/secrets/experience-api.env
cd /opt/buildkart-releases/current/services/hosted
docker compose -f docker-compose.hosted.yml up -d --no-deps --force-recreate experience-api event-workers
```

## Residual

- External push/SMS/email is disabled on staging until valid Firebase credentials exist.
- The 29 historical dead-lettered attempts remain in the table.
- In-app notification records are unaffected.
- Production is not configured by this change and remains unauthorized.
