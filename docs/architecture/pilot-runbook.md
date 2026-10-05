# BuildKart Select-User Pilot Runbook

**Scope:** ~52 products, 4 sellers. Identity/OTP, payment and delivery are simulated; commerce,
marketplace, ERP and reconciliation are real.

## Services (staging)

| Service | Port |
|---|---|
| Medusa/Mercur backend + dashboards | `:9010` (admin `/dashboard`, vendor `/seller`) |
| Experience API (shared backend) | `:9020` |
| Tryton ERP (JSON-RPC) | `:8010` |
| PostgreSQL | `:5433` |
| Redis | `:6379` |

## Pilot credentials (dummy)

### Buyers (OTP `123456`)

| Name | Email | Phone |
|---|---|---|
| Pilot User One | `pilot1@buildkart.test` | `+919000000001` |
| Pilot User Two | `pilot2@buildkart.test` | `+919000000002` |
| Pilot User Three | `pilot3@buildkart.test` | `+919000000003` |

### Sellers (password `supersecret`)

| Seller | Email |
|---|---|
| Sole Society | `seller@mercur.dev` |
| Kickz Corner | `kickz@mercur.dev` |
| Trailhead Outfitters | `trailhead@mercur.dev` |
| UrbanBuild Supply | `urbanbuild@mercur.dev` |

### Admin

`admin@buildkart.local` / `buildkart-staging-admin`

## Buyer pilot flow (all endpoints via `:9020`)

1. **Login** — `POST /v1/auth/otp/challenges` (identifier) → returns dummy OTP; `POST /v1/auth/otp/verify` → session.
2. **Browse** — `GET /v1/collections/{key}` (new_arrivals, recently_viewed, manual, related).
3. **Product** — `GET /v1/products/{id}` → offers + `commercial.selected_seller` + `stock_badge`.
4. **Cart** — `POST /v1/carts` → `POST /v1/carts/{id}/lines`.
5. **Checkout** — `POST /v1/checkouts/{id}/complete` → order group.
6. **ERP** — `POST /v1/admin/tryton/variants` → `POST /v1/checkouts/{id}/reserve|commit`.
7. **Delivery** — `GET /v1/logistics/serviceability?postcode=…` → `POST /v1/checkouts/{id}/shipment` → `GET /v1/shipments/{id}`.
8. **Notifications** — `GET /v1/notifications`.
9. **Reconciliation** — `GET /v1/admin/orders/{id}/reconciliation`.

## What is simulated (never presented as real)

- OTP — fixed code, in-memory session, no provider.
- Payment — `pp_simulated_simulated`, `payment_mode=simulated`, `test_data=true`.
- Delivery — `SIM-…` tracking, fixed status timeline, no carrier.
- Accounting — `staging_test_clearing`, `bank_receipt_claimed=false`.

## Known gaps (not production)

- OTP/payment/logistics are simulated; real providers deferred.
- Medusa uses Redis event bus + workflow engine + locking; durable correlation/events live in the
  `buildkart_experience` Postgres DB.
- Flutter consumes the Experience API via `lib/data/experience_api.dart`; full screen rewiring is in
  progress.
