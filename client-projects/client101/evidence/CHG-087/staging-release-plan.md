# CHG-087 — Scoped staging release plan

**Status:** EXECUTED — STAGING VERIFIED
**Change:** CHG-087 Revision 1 — return inspection and simulated refund closure
**Lane / release mechanism:** D / `migration + event + api+ui + image-rebuild + governed-staging-data`
**Plan date:** 2026-10-28
**Environment:** staging only. Production is forbidden.
**Deploy owner:** requester-authorized OpenCode agent. The human requester authorized this scoped staging release; production remains forbidden.

> The human requester explicitly authorized this scoped staging deployment on 2026-10-28, including the synthetic Experience-only smoke fixture. Execution stopped at no gate.

## Execution result — 2026-10-28

- **Release:** `0dfdbff7db66761e3bc1a393b3050235e65cb035` on `release/chg-087`, based on `a13bcb4`.
- **Current:** `/opt/buildkart-releases/current -> release-0dfdbff`.
- **Health:** API, ops, Admin, Seller and customer web all 200 after proxy restart.
- **Browser QC:** 30/30 PASS at 390×844 and 1440×900; 0 console errors; 0 unexpected failed requests.
- **Smoke:** closed return `ret_96ddc7d0643948f5a39beb60519d1904`; refund `SIM-REFUND-EC1E8AA9`; 2 closure events and 2 owner notifications.
- **Zero effect:** Medusa and Tryton counts unchanged; no external delivery attempt during the smoke.
- **Staging finding:** FCM delivery is enabled with a pre-existing invalid-credential/dead-letter backlog; the smoke itself created no delivery attempt.
- **Cleanup:** smoke fixture removed; zero remaining fixture rows.
- **Rollback:** `release-a13bcb4` plus `rollback-a13bcb4` image tags.
- Full record: `client-projects/client101/evidence/CHG-087/staging-deployment.md`.

---

## 1. Release identity and baseline

| Item | Value |
|---|---|
| Local branch | `feat/bt-sku-pairs` |
| Local HEAD | `bb7d9049230c10f4627d49e9e0f9bacb4fa024b7` |
| Local HEAD relationship | Does **not** contain `a13bcb4`; the staging current release is ahead of this branch |
| Verified staging release | `a13bcb4` (`/opt/buildkart-releases/release-a13bcb4`) |
| Staging current symlink | `release-a13bcb4` — verified at G5 on 2026-10-28 |
| Baseline contents | U-003/U-005 + CHG-086; these are preserved, not replaced by this release |
| Rollback release | `/opt/buildkart-releases/release-a13bcb4` |
| Release target | `release/chg-087` at `0dfdbff7db66761e3bc1a393b3050235e65cb035`, based on `a13bcb4` |
| Deploy from | `/opt/buildkart-releases/release-<CHG087_SHA>` only |
| Never deploy from | `feat/bt-sku-pairs` HEAD, `/opt/buildkart`, or a mutable working tree |
| Production | Not authorized, not touched |

**Re-baseline note:** the previously recorded release was `ecb01e1`. At G5, `current` had moved to `release-a13bcb4`. The release target is therefore based on `a13bcb4`; the CHG-087 diff must be the only change after that baseline.

---

## 2. Scope lock

### Allowed runtime paths

```text
apps/prototype_app/lib/screens/return_flow_screens.dart
apps/prototype_app/test/return_status_layout_test.dart
apps/web/app/globals.css
apps/web/app/layout.tsx
apps/web/app/api/auth/**
apps/web/app/orders/**
apps/web/app/returns/**
apps/web/app/sign-in/**
apps/web/lib/experience-api.ts
services/backend/apps/admin/src/routes/returns/**
services/backend/apps/vendor/src/routes/returns/**
services/backend/packages/api/.mercur/routes.d.ts
services/backend/packages/api/src/api/admin/buildkart/returns/**
services/backend/packages/api/src/api/vendor/buildkart/returns/**
services/backend/packages/api/src/api/middlewares.ts
services/experience-api/src/events/nats-publisher.ts
services/experience-api/src/index.ts
services/experience-api/src/notifications/templates.ts
services/experience-api/src/store/return-store.ts
services/experience-api/src/scripts/manual-transition-*.ts
services/experience-api/src/scripts/chg087-browser-return-fixture.ts
services/experience-api/src/scripts/return-closure-events-test.ts
```

### Allowed governance/evidence paths

```text
client-projects/client101/changes/CHG-087.yaml
client-projects/client101/contracts/data-contract.yaml
client-projects/client101/contracts/asyncapi/buildkart-events-v1.yaml
client-projects/client101/derived/dependency-map.yaml
client-projects/client101/workflow/workflow-state.yaml
client-projects/client101/evidence/CHG-087/**
```

### No-touch paths and records

- Production, staging secrets, customer production data and provider credentials.
- Medusa payment, capture, refund and order-transaction records.
- Tryton stock, reservation, shipment and warehouse-movement records.
- Settlement, commission, invoice, credit-note and accounting records.
- Shiprocket or any real carrier/PSP/accounting integration.
- Unrelated catalogue, pricing, CMS, checkout, Product Studio and merchandising behavior.
- `services/backend/apps/admin/fulfillment-preview*` — preserve exactly, do not add to the release.
- Any staging data outside the single synthetic CHG-087 smoke fixture described in §7.

### Staging data writes

One synthetic, owner-scoped CHG-087 fixture, tagged `test_data=true`:

- `correlation`
- `pilot_shipment` / `pilot_shipment_line` / `pilot_shipment_event`
- `pilot_return_case` / `pilot_return_line` / `pilot_return_event`
- `pilot_return_refund_simulation`
- `pilot_notification`
- `domain_event` (return events)
- `pilot_privileged_audit` (route audit rows, if created)

No Medusa order, payment, refund, inventory or Tryton row is created or changed.

---

## 3. G5 pre-flight — baseline capture (read-only)

Capture into `client-projects/client101/evidence/CHG-087/staging-release-baseline.md`:

1. `git status --short --branch` and local HEAD.
2. On staging: `readlink -f /opt/buildkart-releases/current`.
3. `docker ps` for `buildkart-hosted-pilot-*` with image tags and health.
4. Image IDs/digests for `medusa`, `experience-api`, `web`, `proxy`.
5. Public health and surface status:
   - `https://api-staging.pinakaplay.cloud/health`
   - `https://ops-staging.pinakaplay.cloud/health`
   - `/dashboard/`, `/seller/`, `/ops`, `/erp/`
   - `PUBLIC_APP_HOSTNAME` `/sign-in` and `/` (read the hostname from the staging environment; do not print secrets)
6. PostgreSQL counts/fingerprints for:
   - `buildkart.payment`, `refund`, `order_transaction`, `payment_collection`, `payment_session`
   - `buildkart_tryton.stock_move` and shipment tables
   - `buildkart_experience.pilot_return_case`, `pilot_return_line`, `pilot_return_event`, `pilot_return_refund_simulation`
7. Encrypted pre-change backup of `buildkart` and `buildkart_experience`; verify the restore path on a disposable database.
8. Confirm `FCM_DELIVERY_ENABLED=false` for the smoke; no external push/SMS/email is sent.
9. Confirm no in-flight deploy and record a deploy lock.

**Stop condition:** baseline moved, staging unhealthy, another deploy active, backup cannot be verified, or the current release is not the expected baseline.

---

## 4. Scoped release commit

1. Commit CHG-087 locally using explicit paths only; never `git add -A`.
2. Create `release/chg-087` from `a13bcb4`.
3. Cherry-pick/apply the CHG-087 commit onto that base.
4. Verify the scoped range:

```sh
git log --oneline <baseline>..release/chg-087
git diff --stat <baseline>..release/chg-087
git diff --name-only <baseline>..release/chg-087
```

Expected: one CHG-087 commit, only paths in §2. `a13bcb4` already includes U-003/U-005/CHG-086; any additional commit, unrelated docs, `fulfillment-preview*`, or Product Studio file is a stop-the-line event.

5. Run the full local verification set again on the release commit:
   - contract validation
   - Experience API typecheck
   - Admin/Vendor builds
   - Web typecheck/build
   - Flutter analyze/test
   - DB/HTTP/event acceptance scripts against the disposable stack
6. Freeze the target SHA. Push the scoped branch to origin (no force push), then fetch it on the staging host:

```sh
git push origin release/chg-087
ssh -i ~/.ssh/buildkart_deploy root@89.116.20.164 \
  "cd /opt/buildkart && git fetch origin release/chg-087"
```

7. Create an immutable worktree on the staging host:

```sh
ssh -i ~/.ssh/buildkart_deploy root@89.116.20.164 \
  "cd /opt/buildkart && git worktree add --detach \
   /opt/buildkart-releases/release-<CHG087_SHA> <CHG087_SHA>"
```

---

## 5. Migration and schema rehearsal

CHG-087 has **no standalone Experience API migration file**. `ReturnStore.ensureSchema()` applies additive, idempotent changes on API startup:

- `pilot_return_case.version integer NOT NULL DEFAULT 1`
- new inspection columns on `pilot_return_line`
- `pilot_return_refund_simulation`
- `pilot_return_event.operation_key`

No column is dropped, renamed or narrowed. Existing rows receive defaults and remain readable by the old code.

### Rehearsal gate

1. Restore the encrypted `buildkart_experience` backup into a disposable database or isolated PostgreSQL.
2. Run the new Experience API image/schema against the clone.
3. Run `manual-transition-db-test.ts` against the clone.
4. Capture before/after `\d pilot_return_*`, row counts and event/simulation counts.
5. Confirm old code can still read the additive schema (backward-compatibility check).
6. Drop the rehearsal database and record the result.

No rehearsal is run against shared staging. No Medusa schema change is expected for CHG-087; the standard `medusa-migrate` predeploy still runs as a gate and must complete successfully.

**Stop condition:** rehearsal fails, schema is destructive, or old code cannot read the new schema.

---

## 6. Build and image verification

Build once from the immutable release worktree:

```sh
cd /opt/buildkart-releases/release-<CHG087_SHA>/services/hosted
docker compose -f docker-compose.hosted.yml build --no-cache \
  medusa-api medusa-worker experience-api event-workers web
```

`--no-cache` is deliberate: CHG-086 proved that a cached Medusa/Experience API image can serve stale code. Verify behavior markers, not the “Image built” line.

| Image | Required marker |
|---|---|
| `buildkart-hosted-pilot-medusa` | CHG-087 Admin bundle contains the inspection/refund controls; vendor bundle contains the Seller inspection workflow; proxy route files include `/refund-simulation` |
| `buildkart-hosted-pilot-experience-api` | Source contains `return.inspection-completed.v1` and `return.refund-simulation-recorded.v1`; `refund-simulation` route present |
| `buildkart-hosted-pilot-web` | Standalone build contains `/sign-in`, `/orders`, `/returns` routes and the simulated-refund wording |

Before recreating, tag rollback images:

```sh
docker tag buildkart-hosted-pilot-medusa:latest buildkart-hosted-pilot-medusa:rollback-<BASELINE_SHA>
docker tag buildkart-hosted-pilot-experience-api:latest buildkart-hosted-pilot-experience-api:rollback-<BASELINE_SHA>
docker tag buildkart-hosted-pilot-web:latest buildkart-hosted-pilot-web:rollback-<BASELINE_SHA>
```

Record image digests in the evidence.

---

## 7. Staging smoke fixture

Use a dedicated synthetic fixture, e.g. `chg087_staging_smoke`, based on the local browser fixture:

- Owner: an approved staging pilot identity read from the staging secret; do not print it.
- Seller: an approved staging seller scope; do not print credentials.
- Order group, shipment, return and refund simulation are synthetic and Experience-only.
- No Medusa order, payment, refund or Tryton movement is created.
- `money_effect=none`, `stock_effect=none`, `test_data=true`, `simulated=true`.
- The fixture advances through `approved → received → inspection_complete → closed` through the real API/store.

This is a **staging data write** and is separately gated. The allowlist is the fixture ID plus its correlation/order-group references. Cleanup is a targeted delete, not a truncate/drop.

If the requester does not approve a synthetic staging data write, the alternative is read-only browser verification against existing staging returns. That would not exercise the new inspection/refund path end-to-end; record it as a limitation rather than pretending the journey was accepted.

**Do not run the local fixture script against staging unchanged.** `chg087-browser-return-fixture.ts` writes local evidence and requires `CHG087_ISOLATED_ACCEPTANCE=true`. Create a staging-only variant or parameterize it behind a separate explicit staging guard, with no local-file writes and a hard-coded fixture allowlist. That staging fixture script is a pre-execution deliverable and must be reviewed before the data gate.

---

## 8. Deploy sequence (G6)

Run as the named deploy owner, with the lock held:

1. Confirm the symlink still points at the verified baseline and no deploy is in flight.
2. Run the standard predeploy gate:
   `docker compose -f docker-compose.hosted.yml run --rm medusa-migrate`
3. Recreate `medusa-api`; wait for healthy. Verify its health endpoint and one Admin/Seller asset marker.
4. Recreate `experience-api`; wait for healthy. Verify schema tables, NATS connection and stream subjects include `return.>`.
5. Recreate `medusa-worker`; confirm healthy/started and no crash loop.
6. Recreate `event-workers`; verify `/health`, consumer stats and no dead-letter growth.
7. Recreate `web`; verify `/sign-in` and `/` through the internal network.
8. Restart the proxy:
   `docker restart buildkart-hosted-pilot-proxy-1`
9. Verify public surfaces immediately after the proxy restart.
10. Run the staging smoke fixture and browser/API acceptance.
11. Remove the smoke fixture and capture final counts.
12. Write `staging-deployment.md` and update CHG-087/workflow state only if every gate passes.

Use `docker compose up -d --no-deps --force-recreate <service>` for controlled recreation; do not recreate unrelated services.

---

## 9. Verification matrix

### Release integrity

- Target SHA and commit range match the scoped allowlist.
- Images contain the CHG-087 behavior markers.
- `experience-api` schema is present and additive.
- JetStream stream subjects include `return.>`; both new subjects publish and are consumed.
- `return.refund-paid.v1` is absent from the contract and code.

### API and role boundaries

- Unauthenticated Admin/Seller/customer calls fail closed.
- Customer A cannot read Customer B’s order, return or refund simulation.
- Seller A cannot read or inspect Seller B’s return; denial writes no event.
- Seller cannot approve, reject, cancel or create a refund simulation.
- Seller view returns `refundSimulation: null` and redacted event detail.
- Inspection requires receipt, current version and every approved line exactly once.
- Refund simulation requires completed inspection, Admin permission, explicit amount/breakdown and an operation key.
- Duplicate refund simulation returns the original projection and does not add an event/simulation.
- Second, different refund simulation is rejected.

### UI

- Customer web: OTP sign-in, orders, order detail, return detail, sign-out, unauthenticated redirect, other-owner 404 at 390×844 and 1440×900.
- Admin: approved, received, inspection_complete, closed; inspection and refund controls; no page-level overflow.
- Seller: approved, received, inspection_complete, closed; inspection controls only; no refund amount/reference.
- Zero browser console errors and no unexpected failed requests.
- Screenshots written to `evidence/CHG-087/staging-screenshots/**`.

### Zero effect

- Medusa payment/refund/transaction counts and fingerprints unchanged.
- Tryton stock_move/shipment counts and fingerprints unchanged.
- Isolated/staging return rows change only for the smoke fixture.
- No FCM/external notification sent while `FCM_DELIVERY_ENABLED=false`.
- No real money, stock, invoice, settlement or carrier effect.

### Events/notifications

- `return.inspection-completed.v1` and `return.refund-simulation-recorded.v1` appear in the outbox/stream.
- One owner notification per event; duplicate publication does not create a second notification.
- Event payloads carry `test_data=true`, `simulated=true`, `money_effect=none`, `stock_effect=none`.
- Consumer lag/dead-letter counters remain healthy.

---

## 10. Rollback

### Code

```sh
docker tag buildkart-hosted-pilot-medusa:rollback-<BASELINE_SHA> buildkart-hosted-pilot-medusa:latest
docker tag buildkart-hosted-pilot-experience-api:rollback-<BASELINE_SHA> buildkart-hosted-pilot-experience-api:latest
docker tag buildkart-hosted-pilot-web:rollback-<BASELINE_SHA> buildkart-hosted-pilot-web:latest
ln -sfn /opt/buildkart-releases/release-<BASELINE_SHA> /opt/buildkart-releases/current
cd /opt/buildkart-releases/release-<BASELINE_SHA>/services/hosted
docker compose -f docker-compose.hosted.yml up -d --no-deps --force-recreate \
  medusa-api medusa-worker experience-api event-workers web
docker restart buildkart-hosted-pilot-proxy-1
```

### Database

- **No down migration.** The CHG-087 schema is additive and backward compatible. Leave the new tables/columns in place when rolling back code; the old code ignores them.
- Remove only the smoke fixture rows.
- Restore the encrypted pre-change backup only if data corruption is proven. Do not restore casually; it would overwrite unrelated staging changes made after the backup.

### Edge

- Restart the proxy after recreating containers.
- Verify public health, Admin/Seller, customer web and the API after rollback.
- Record rollback image digests and the restored symlink.

---

## 11. Cleanup

After acceptance or rollback:

- Delete the smoke fixture by allowlisted IDs/correlation references.
- Verify zero remaining fixture rows across correlation, shipment, return, simulation, notification, domain-event and audit tables.
- Do not drop the new tables/columns during the release; they are the additive schema.
- Remove any temporary rehearsal database and dump.
- Confirm no test containers, preview servers or staging-only scripts remain.
- Keep the evidence and screenshots; do not commit secrets or `.env` files.

---

## 12. Stop conditions

Stop and re-baseline or escalate if any of these occurs:

1. Staging `current` is not the verified baseline.
2. Another deploy is in progress.
3. The target commit contains a path outside §2.
4. `medusa-migrate` or the schema rehearsal fails.
5. Any image lacks the CHG-087 behavior marker.
6. A service is unhealthy after the health gate.
7. The proxy returns 502 after restart.
8. Browser QC has a console error or page-level overflow.
9. Customer/Seller isolation or refund redaction fails.
10. Medusa/Tryton counts or fingerprints change.
11. Data outside the smoke fixture is written.
12. A secret would be printed, committed or exposed.
13. Staging authorization is absent or ambiguous.

Production remains forbidden even if every staging gate passes.

---

## 13. Evidence to produce after execution

- `client-projects/client101/evidence/CHG-087/staging-release-baseline.md`
- `client-projects/client101/evidence/CHG-087/staging-schema-rehearsal.md`
- `client-projects/client101/evidence/CHG-087/staging-deployment.md`
- `client-projects/client101/evidence/CHG-087/staging-screenshots/**`
- Staging API/HTTP outputs, browser console/network capture, zero-effect counts, event/notification proof
- Release SHA, commit range, image digests, rollback SHA and rollback tags
- Deferred register and residual risks

---

## 14. Execution decisions

1. **Baseline confirmation:** `release-a13bcb4` was verified and preserved; the release commit is based on it.
2. **Deploy owner/window:** requester-authorized OpenCode agent; executed on 2026-10-28.
3. **Smoke data:** one synthetic Experience-only fixture was approved, used and removed.
4. **Flutter scope:** source-only; no Flutter web/Firebase or app-distribution release was made.
5. **Customer web host:** `app-staging.pinakaplay.cloud` confirmed and verified.

Execution results are recorded in `staging-deployment.md`.
