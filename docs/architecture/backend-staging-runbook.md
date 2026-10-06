# BuildKart Staging Runbook

Local functional staging for the CHG-017 vertical slice. Synthetic data only.

## Services and ports

| Service | Host port | Notes |
|---|---|---|
| Mercur/Medusa backend | `9010` | Commerce + Marketplace API |
| Admin panel | `9010/dashboard` | Operator dashboard |
| Vendor panel | `9010/seller` | Seller dashboard |
| Experience API | `9020` | Shared backend + simulated payment |
| PostgreSQL | `5433` | `buildkart` database |
| Redis | `6379` | queue/cache |
| NATS JetStream | `4222` (`8222` monitoring) | cross-system domain events |
| Tryton | `8010` | ERP — JSON-RPC only (no browser UI) |
| Reverse proxy (nginx) | `8081` → Experience API/Medusa | `services/proxy/nginx.conf`; `docker compose up -d proxy` |

## Staging credentials (synthetic, never reuse in production)

| Role | Identifier | Secret |
|---|---|---|
| Admin | `admin@buildkart.local` | `buildkart-staging-admin` |
| Seller (BuildMaster Supplies) | `buildmaster@mercur.dev` | `supersecret` |
| Seller (PowerMax Depot) | `powermax@mercur.dev` | `supersecret` |
| Seller (AquaFlow Supplies) | `aquaflow@mercur.dev` | `supersecret` |
| Seller (UrbanBuild Supply) | `urbanbuild@mercur.dev` | `supersecret` |

## Bring-up order

```sh
# 1. Datastores
docker compose -f services/docker-compose.yml up -d postgres redis

# 2. Tryton (ERP)
docker compose -f services/docker-compose.yml up -d --build tryton

# 3. Backend (Commerce + Marketplace)
cd services/backend
bun install
cd packages/api
bunx medusa db:migrate
bun run seed
bun run build     # production-shaped compile (medusa build)
bun run start     # production server (no watcher) — faster than `bun run dev`
```

`bun run dev` (`medusa develop`) is the hot-reload watcher and is **not** representative of production
performance. Use `bun run build && bun run start` for load tests.

## Experience API (shared backend)

```sh
cd services/experience-api
bun run src/index.ts   # :9020
```

Test/evidence scripts:

- `bun run test:concurrency` — reservation no-oversell + idempotency.
- `bun run test:expiry` — reservation expiry + late-payment re-reserve.
- `bun run test:erp` — Tryton stock-movement commit/release + test-clearing accounting (no bank receipt).
- `bun run test:reconciliation` — cross-system correlation, mismatch visibility and API recovery.
- `bun run test:connectivity` — shared app/operator surfaces + environment/freshness/test markers.
- `bun run test:isolation` — production fail-closed, local credential-free routing, network-free simulators.
- `bun run test:payment-flow` — payment guard, canonical simulated checkout, committed Tryton
  reservation + reconciliation, retry idempotency, test-only metadata, outbox/NATS delivery and
  Mercur allocation-consumer receipt.
- `bun run test:payment-matrix` — simulator outcome matrix (success/failure/pending/duplicate/late/
  refund) with idempotency and non-financial guarantees.
- `bun run test:nats` — JetStream stream/subject publication check.
- `bun run test:consume` — one-batch durable-consumer harness (legacy).
- `bun run test:consumers` — continuous worker check: process + dedupe + dead-letter.
- `bun run start:workers` — run the long-lived cross-system event workers (`:9030` `/health`,
  `/metrics`). One durable consumer per owning service.
- `bun run test:load` — load profile (VIRTUAL_USERS / DURATION_MS env). Set
  `TARGET_BASE_URL=http://localhost:8081` to drive it through the reverse proxy. Reports throughput,
  latency and errors plus the resource profile from `/metrics` (process CPU/RSS, PostgreSQL pool
  usage, offer-cache hit ratio, NATS consumer lag).
- `bun run src/parity-check.ts` — cross-surface parity.

## Verify services

- Medusa/Mercur: open http://localhost:9010/health (returns `OK`) and http://localhost:9010/dashboard (login).
- Experience API: http://localhost:9020/health (JSON).
- Experience API composed product: http://localhost:9020/v1/products/{productId} (Medusa product + Mercur offers).
- Experience API checkout: `POST /v1/carts` → `POST /v1/carts/{id}/lines` →
  `POST /v1/carts/{id}/customer-details` → `GET /v1/carts/{id}/shipping-options` → one
  `POST /v1/carts/{id}/shipping-methods` per seller → `POST /v1/checkouts/{id}/complete`.
- Experience API completion initializes/reuses the cart's Medusa payment collection and
  `pp_simulated_simulated` session before calling cart complete. The separate `/v1/payments/*`
  routes remain simulator-control endpoints for failure/recovery scenarios.
- PostgreSQL: `docker exec buildkart_postgres pg_isready -U buildkart -d buildkart`.
- Redis: `docker exec buildkart_redis redis-cli ping`.
- Tryton (JSON-RPC, no browser UI):
  ```sh
  curl -s -X POST http://localhost:8010/rpc/ \
    -H 'Content-Type: application/json' \
    -d '{"method":"common.db.list","params":[],"id":1}'
  # -> {"id":1,"result":["buildkart_tryton"]}
  ```

## Simulated payment provider

- Module: `services/backend/packages/api/src/modules/simulated-payment/`.
- Registered as `pp_simulated_simulated` and enabled on the India region.
- It authorizes/captures/refunds without a gateway and stamps `payment_mode=simulated` / `test_data=true`.
- The cart carries the same markers into every canonical seller order; payment-session data and the
  `order.confirmed` outbox payload preserve them too.
- Completion is serialized with a PostgreSQL advisory lock. A durable correlation snapshot returns
  the original order group/payment session on duplicate completion instead of invoking Mercur twice.
- It unblocks `POST /store/carts/{id}/complete`, which produces a Mercur **order group** of per-seller
  Medusa orders; each order line carries the seller `offer_id`.
- Direct Medusa completion without an initialized payment session remains rejected.

## Tryton ERP integration

- `services/experience-api/src/tryton/` — Tryton JSON-RPC client + ERP orchestration.
- Variant sync: `POST /v1/admin/tryton/variants` maps a Medusa variant SKU → Tryton `product.template`.
- Reservation lifecycle: `POST /v1/checkouts/{id}/reserve|commit|release` models the reservation as a
  Tryton `stock.move` (draft → assigned/cancelled).
- Reconciliation: `GET /v1/admin/orders/{id}/reconciliation` correlates the Medusa order group and the
  Tryton move, with `accounting_treatment=staging_test_clearing` and `bank_receipt_claimed=false`.
- The Tryton instance was initialised with the `stock,sale,stock_supply,account,account_invoice` modules
  and a minimal `INR` currency + `BuildKart India` company.

## Configurable rules / durable state / collections

- Durable correlation + domain events stored in a `buildkart_experience` Postgres database
  (`correlation` + `domain_event` tables).
- Dynamic collections: `GET /v1/collections/{key}` (new_arrivals, recently_viewed, manual, related;
  best_sellers/buy_again deferred).
- Commercial eligibility on composed product (`commercial.selected_seller`, `stock_badge`,
  `payment_eligibility`).
- Admin: `GET /v1/admin/events`, `GET /v1/admin/collections`,
  `GET /v1/admin/environment` (redacted routing + provider summary; `404` in production).
- Parity check: `bun run src/parity-check.ts`.

## Client wiring

- Flutter `apps/prototype_app/lib/core/app_config.dart` points at the staging stack: Medusa `:9010`,
  Experience API `:9020`, real publishable key.
- Flutter checkout discovers and explicitly selects one eligible delivery option per seller, then
  shows success only after Experience API returns a canonical simulated order group. It no longer
  presents Razorpay/Cashfree/COD mock choices or manufactures local checkout success.
- Seller and operator surfaces are the Mercur dashboards (already wired to `:9010`).
- Web pilot surface: `apps/web` (Next.js App Router, `:3000`) consumes the shared Experience API
  server-side (so no CORS is needed) and shows success only after a canonical simulated order group.
  Run `cd apps/web && npm ci && npm run dev`; set `EXPERIENCE_API_BASE_URL` (default
  `http://localhost:9020`). The full customer/B2B web experience (accounts, B2B pricing, RFQ, cart
  persistence) remains Phase 6.

## Event topology (D-017-15)

Medusa internal events/workflows/locking use Redis. Cross-system events use the Experience API's
PostgreSQL `domain_event` outbox and NATS JetStream.

Consumers run continuously via `bun run start:workers` (`src/workers/event-consumers.ts`): one
durable consumer per owning service (`mercur-allocation` on `commerce.>`, `tryton-reservation` on
`inventory.>`, `reconciliation-tracker` on `logistics.>`). Each acks only after the handler succeeds,
retries with `nak` backoff, and dead-letters a poison message to `buildkart.dlq.v1` after
`WORKER_MAX_DELIVER` attempts. Processing is idempotent per event id. Lag and
processed/failed/dead-letter counters are exposed as Prometheus text on `:9030/metrics` and JSON on
`:9030/health`.

## Reverse proxy and resource metrics

`docker compose up -d proxy` starts an nginx reverse proxy (`:8081`) fronting the Experience API
(`/v1/`, `/health`, `/metrics`, `/ops`) and Medusa (`/store/`). Upstream keepalive is intentionally
disabled: the Bun upstream closes idle connections, and reusing a stale pooled connection adds
latency/502s, while a fresh connection to the host is ~2ms.

The Experience API exposes Prometheus-style telemetry at `GET /metrics`: process CPU / RSS / heap,
the PostgreSQL connection-pool `total`/`idle`/`waiting` per store, the offer read-model cache
`entries` and `hits`/`misses` counters, NATS connectivity, and per-durable-consumer lag.
`bun run test:load` (with `TARGET_BASE_URL`) prints a resource profile captured from `/metrics`
before and after a run.

## Seed data

The seed uses an **India / INR** region with **market-realistic INR prices** for a construction /
hardware catalogue (~52 products across 6 departments: Construction, Bathroom & Plumbing,
Tiles & Plywood, Electrical, Agriculture & Seeds, Pumps & Machines). Products are single-SKU with
`Color` + `Condition` attributes (no footwear size axis). Product imagery is deterministic Picsum
placeholders — replace with real photography before production. The catalogue lives in
`src/scripts/catalog.ts`.

## State

- PostgreSQL and Redis: running (healthy).
- Backend: **production build + `medusa start`** (compiled, no watcher); seeded (4 sellers, ~52 hardware products); admin user created.
- Experience API: running with read-model offer cache (30s TTL) + atomic reservation ledger.
- Tryton: modules initialised, DB reset clean for the hardware pilot (ERP sync/reserve verified against a fresh instance).
- CHG-017: **G0 governance + G1–G6 evidence closed** for the bounded staging pilot (see `CHG-017-G0-closure-report.md` and `CHG-017-G1-G6-evidence-status.md`).

## Known staging gaps (not production)

- **Event consumers** — continuous, service-owned workers with retry, idempotency, dead-letter
  (`buildkart.dlq.v1`) and lag metrics are implemented (`start:workers`). The worker reactions are
  side-effect-free placeholders; the owning Mercur/Tryton/reconciliation services must supply the
  real reactions and run the workers in their own deployment before production.
- Payment is simulated (`PAYMENT_ADAPTER_MODE=simulated`); real payment/OTP/logistics providers are deferred.
- A bounded-staging debug APK has completed the full emulator checkout journey to a canonical order
  group verified in PostgreSQL/NATS (see `evidence/CHG-017/payment-simulation-acceptance.md`). Human
  review is still required before the shared-surface evidence item is accepted.
- Production OTel traces, central logs, and secret-manager mechanism are deferred (staging uses structured
  JSON logs, `/health`, the durable domain-event log, and correlation ids).

## Safety

- Do not point any client or config at production endpoints.
- Staging secrets are synthetic and must never be reused.
- Production must fail closed if `PAYMENT_ADAPTER_MODE=simulated` is detected.
- Both Experience API startup and Medusa provider registration apply the production fail-closed guard.
