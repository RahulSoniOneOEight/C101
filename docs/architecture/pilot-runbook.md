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

## Pilot identities and simulated OTP

Hosted staging reads the allowlist from `PILOT_USERS_JSON` and verifies its expected size through
`PILOT_EXPECTED_USER_COUNT=20`. Put the JSON directly in the authorised secret/configuration store;
do not commit the real tester list. Each entry has this shape:

```json
{"id":"pilot_01","email":"tester@example.invalid","username":"optional","phone":"optional","name":"Pilot Tester"}
```

`PILOT_OTP_CODE=123456` is the shared simulated code. Challenges and hashed bearer-session keys are
stored in Redis using `REDIS_URL`; they survive API restarts and work across replicas. Recommended
hosted configuration:

```text
PILOT_EXPECTED_USER_COUNT=20
PILOT_OTP_CODE=123456
PILOT_CHALLENGE_TTL_SECONDS=300
PILOT_SESSION_TTL_SECONDS=3600
REDIS_URL=<secret-managed staging Redis URL>
```

### Local synthetic buyers

When `PILOT_USERS_JSON` is absent, local development retains these three synthetic users:

| Name | Email | Phone |
|---|---|---|
| Pilot User One | `pilot1@buildkart.test` | `+919000000001` |
| Pilot User Two | `pilot2@buildkart.test` | `+919000000002` |
| Pilot User Three | `pilot3@buildkart.test` | `+919000000003` |

### Sellers (password `supersecret`)

| Seller | Email |
|---|---|
| BuildMaster Supplies | `buildmaster@mercur.dev` |
| PowerMax Depot | `powermax@mercur.dev` |
| AquaFlow Supplies | `aquaflow@mercur.dev` |
| UrbanBuild Supply | `urbanbuild@mercur.dev` |

### Admin

`admin@buildkart.local` / `buildkart-staging-admin`

## Buyer pilot flow (all endpoints via `:9020`)

1. **Login** — `POST /v1/auth/otp/challenges` (identifier) creates a challenge without returning the code; `POST /v1/auth/otp/verify` with `123456` returns a bearer session.
2. **Browse** — `GET /v1/collections/{key}` (new_arrivals, recently_viewed, manual, related).
3. **Product** — `GET /v1/products/{id}` → offers + `commercial.selected_seller` + `stock_badge`.
4. **Cart** — send `Authorization: Bearer <session>` to `POST /v1/carts` and every cart mutation. The cart is bound to that pilot user.
5. **Checkout** — `POST /v1/checkouts/{id}/complete` requires the owner session and returns an order group.
6. **ERP** — `POST /v1/admin/tryton/variants` → `POST /v1/checkouts/{id}/reserve|commit`.
7. **Delivery** — `GET /v1/logistics/serviceability?postcode=…` → `POST /v1/checkouts/{id}/shipment` → `GET /v1/shipments/{id}`.
8. **Notifications** — `GET /v1/notifications` currently returns only event projections owned by the authenticated user; the persistent `/v1/me/notifications` feed follows in the notification increment.
9. **Reconciliation** — `GET /v1/admin/orders/{id}/reconciliation`.

## What is simulated (never presented as real)

- OTP — fixed code, Redis-backed expiring session, no provider.
- Payment — `pp_simulated_simulated`, `payment_mode=simulated`, `test_data=true`.
- Delivery — `SIM-…` tracking, fixed status timeline, no carrier.
- Accounting — `staging_test_clearing`, `bank_receipt_claimed=false`.

## Known gaps (not production)

- OTP/payment/logistics are simulated; real providers deferred.
- Medusa uses Redis event bus + workflow engine + locking; durable correlation/events live in the
  `buildkart_experience` Postgres DB.
- Flutter consumes the Experience API via `lib/data/experience_api.dart`; full screen rewiring is in
  progress.
- Hosted deployment must set `PILOT_USERS_JSON` and `PILOT_EXPECTED_USER_COUNT=20`; the synthetic
  fallback is for local development only.
