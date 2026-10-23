# Order workbench QC — 2026-10-23

Change: CHG-035 revision 6, manual order workbench increment
Branch: `feat/order-detail-workbench`
Scope: local implementation and static/pure verification only. No staging deployment, push, merge or production authorization.

## Implemented surfaces

- Admin and Seller order-detail widgets in `orders.detail.main.after`.
- Manual, versioned shipment status routes for Admin and Seller.
- Manual, versioned operational return status routes for Admin and Seller.
- Admin-only return approve/reject retained.
- Seller-scoped order-group delivery/returns read route.
- Admin and Seller shipment and return detail pages aligned to the same routes.
- Partial delivery persistence and evidence enforcement.
- Seller transition filtering and seller cancellation restriction.

## Local verification

| Check | Result |
| --- | --- |
| Experience API `tsc --noEmit` | pass |
| API package `tsc --noEmit` | pass |
| Admin panel `tsc -b && vite build` | pass |
| Seller panel `tsc -b && vite build` | pass |
| Changed panel files ESLint | pass |
| `test:manual-transitions` | pass |
| `test:return-no-effects` | pass |
| `test:return-eligibility` | pass |
| `CHG-035.yaml` parse | pass |

The Seller panel build prints a pre-existing dashboard warning that the Medusa config refused to load because simulated payment is configured for production. The build still completed; this is an environment/configuration warning, not a workbench compile failure.

## Contract checks covered by `test:manual-transitions`

- Delivered and cancelled are terminal for manual shipment transitions.
- Partial delivery can advance to `partially_delivered` again or to `delivered`.
- Complete delivery from an incomplete quantity set is rejected.
- A `partially_delivered` update with all units complete is rejected.
- Missing, duplicate, negative or zero delivery lines are rejected.
- Delivered provider events require proof and positive per-line quantities.
- Sellers cannot cancel a shipment or a return.
- Sellers cannot approve, reject or reopen a return decision.

## Not verified locally

- No PostgreSQL instance or Docker daemon was available, so database-backed shipment, return idempotency, restart and HTTP isolation tests were not run.
- No deployed staging runtime check, screenshot review or WCAG keyboard pass was performed.
- Migration/rollback rehearsal for the new `version` columns and `operation_key` unique index is outstanding.
- Native order payload completeness for payment/refund tiles is not guaranteed by this repository alone; the UI degrades to `Not available` when those fields are absent.

## Runtime authorization

- Staging deployment: not authorized in this increment.
- Production release: not authorized.
