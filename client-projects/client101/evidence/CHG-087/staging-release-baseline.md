# CHG-087 — Staging release baseline

Date: 2026-10-28
Captured before the CHG-087 deployment.

| Item | Value |
|---|---|
| Current symlink | `/opt/buildkart-releases/current -> /opt/buildkart-releases/release-a13bcb4` |
| Baseline commit | `a13bcb4` (U-003/U-005 + CHG-086) |
| API health | 200 |
| Ops health | 200 |
| Admin | 200 |
| Seller | 200 |
| Customer app host | `app-staging.pinakaplay.cloud` |

## Containers

`medusa-api` healthy, `experience-api` healthy, `web` healthy, `medusa-worker` running, `event-workers` running, `postgres`/`redis`/`nats` healthy, `proxy` running, `cms`/`workspace`/`tryton` healthy.

## Database counts before change

| Database | Table | Count |
|---|---|---:|
| `buildkart` | `payment` | 20 |
| `buildkart` | `refund` | 1 |
| `buildkart` | `order_transaction` | 1 |
| `buildkart` | `payment_collection` | 31 |
| `buildkart` | `payment_session` | 31 |
| `buildkart_tryton` | `stock_move` | 55 |
| `buildkart_tryton` | `stock_shipment_in` | 0 |
| `buildkart_tryton` | `stock_shipment_out` | 0 |
| `buildkart_tryton` | `stock_shipment_out_return` | 0 |
| `buildkart_experience` | `pilot_return_case` | 4 |
| `buildkart_experience` | `pilot_return_line` | 4 |
| `buildkart_experience` | `pilot_return_event` | 10 |
| `buildkart_experience` | `pilot_return_refund_simulation` | table absent (expected) |

## Backup

- Encrypted backup stamp: `20261028T174232Z`
- Databases: `buildkart`, `buildkart_experience`, `buildkart_tryton`, `buildkart_cms`
- Restore proof on `buildkart_experience`: PASS — 23 public tables restored into a disposable database.
