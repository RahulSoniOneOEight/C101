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
| Tryton | `8010` | ERP — JSON-RPC only (no browser UI) |

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
bun run db:migrate
bun run seed
bun run dev
```

## Verify services

- Medusa/Mercur: open http://localhost:9010/health (returns `OK`) and http://localhost:9010/dashboard (login).
- Experience API: http://localhost:9020/health (JSON).
- Experience API composed product: http://localhost:9020/v1/products/{productId} (Medusa product + Mercur offers).
- Experience API checkout: POST /v1/carts → POST /v1/carts/{id}/lines → POST /v1/checkouts/{id}/complete.
- Experience API simulated payment: POST /v1/checkouts/{id}/payment-sessions then POST /v1/payments/{id}/simulate.
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
- It unblocks `POST /store/carts/{id}/complete`, which produces a Mercur **order group** of per-seller
  Medusa orders; each order line carries the seller `offer_id`.

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
- Admin: `GET /v1/admin/events`, `GET /v1/admin/collections`.
- Parity check: `bun run src/parity-check.ts`.

## Client wiring

- Flutter `apps/prototype_app/lib/core/app_config.dart` points at the staging stack: Medusa `:9010`,
  Experience API `:9020`, real publishable key.
- Seller and operator surfaces are the Mercur dashboards (already wired to `:9010`).
- Web (Next.js B2C/B2B) is Phase 6 — not yet scaffolded.

## Known gap — Redis outbox/inbox (D-017-15)

Medusa still uses the local event bus + in-memory locking. A durable `domain_event` log exists in the
Experience API, but the full Redis-backed event bus / workflow engine / locking requires registering
`@medusajs/event-bus-redis`, `@medusajs/workflow-engine-redis` and `@medusajs/locking-redis` through
Medusa's module-package resolution (not the bare package name, which fails `serviceName` lookup). Tracked
as a remaining reliability item.

## Seed data

The seed uses an **India / INR** region with **market-realistic INR prices** for a construction /
hardware catalogue (~52 products across 6 departments: Construction, Bathroom & Plumbing,
Tiles & Plywood, Electrical, Agriculture & Seeds, Pumps & Machines). Products are single-SKU with
`Color` + `Condition` attributes (no footwear size axis). Product imagery is deterministic Picsum
placeholders — replace with real photography before production. The catalogue lives in
`src/scripts/catalog.ts`.

## State

- PostgreSQL and Redis: running (healthy).
- Backend: dependencies installed, migrations applied, seeded (4 sellers, ~52 hardware products), admin user created.
- Tryton: image build + module init (in progress during initial bring-up).

## Known staging gaps (not production)

- Medusa runs the local event bus and in-memory locking by default; durable outbox/inbox and
  Redis-backed transport are reliability work tracked under D-017-15 / E-017-015.
- Payment is simulated (`PAYMENT_ADAPTER_MODE=simulated`); the simulator is not yet wired into the
  checkout flow — that is the next Experience-API increment.
- Identity/OTP, logistics, notifications, and accounting-policy evidence remain pending.

## Safety

- Do not point any client or config at production endpoints.
- Staging secrets are synthetic and must never be reused.
- Production must fail closed if `PAYMENT_ADAPTER_MODE=simulated` is detected.
