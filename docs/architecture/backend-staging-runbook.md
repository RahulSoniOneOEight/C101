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
| Seller (Sole Society) | `seller@mercur.dev` | `supersecret` |
| Seller (Kickz Corner) | `kickz@mercur.dev` | `supersecret` |
| Seller (Trailhead Outfitters) | `trailhead@mercur.dev` | `supersecret` |

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
- Variant sync: `POST /v1/admin/tryton/variants` maps a Medusa variant SKU → Tryton `product.product`.
- Reservation lifecycle: `POST /v1/checkouts/{id}/reserve|commit|release` models the reservation as a
  Tryton `stock.move` (draft → assigned/cancelled).
- Reconciliation: `GET /v1/admin/orders/{id}/reconciliation` correlates the Medusa order group and the
  Tryton move, with `accounting_treatment=staging_test_clearing` and `bank_receipt_claimed=false`.
- The Tryton instance was initialised with the `stock,sale,stock_supply,account,account_invoice` modules
  and a minimal `INR` currency + `BuildKart India` company.

## Seed data

The seed now uses an **India / INR** region (`reg_01M4489T2F1K8C8QKMX8N8Z4F6`). Demo price
magnitudes are unchanged from the template (small integers) — they are INR-consistent but not
market-realistic; adjust `priceByHandle` in `seed.ts` if realistic INR pricing is required.

## State

- PostgreSQL and Redis: running (healthy).
- Backend: dependencies installed, migrations applied, seeded (3 sellers, 244 offers), admin user created.
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
