# Order workbench end-to-end verification — 2026-10-23

Change: CHG-035 revision 6, manual order workbench increment
Branch: `feat/order-detail-workbench`
Release: `/opt/buildkart-releases/release-4387658` (commit `4387658`)
Scope: local and hosted staging verification. Production release is not in scope.

## Implemented surfaces

- Admin and Seller order-detail widgets in `orders.detail.main.after`.
- Manual, versioned shipment status routes for Admin and Seller.
- Manual, versioned operational return status routes for Admin and Seller.
- Admin-only return approve/reject retained.
- Seller-scoped order-group delivery/returns read route.
- Admin and Seller shipment and return detail pages aligned to the same routes.
- Partial delivery persistence and evidence enforcement.
- Seller transition filtering and seller cancellation restriction.
- Container-responsive workbench layout for Mercur's ~740px order main column.

## Staging deployment

- Immutable release worktree created from pushed commit `4387658`.
- Images rebuilt for `medusa-api`, `medusa-worker`, `experience-api` and `event-workers`.
- `medusa-migrate` completed; modules and links reported up to date.
- `current` symlink points to `release-4387658`.
- All hosted containers healthy after proxy restart.
- Pre-deploy Experience database dump:
  `/opt/buildkart-releases/backups/buildkart_experience-pre-4387658.dump` (153,410 bytes).

Public verification:

| Check | Result |
| --- | --- |
| `https://api-staging.pinakaplay.cloud/health` | `200`, staging, simulated payment, NATS and identity connected |
| `https://ops-staging.pinakaplay.cloud/health` | `200` |
| `/dashboard/` | `200`; assets under `/dashboard/assets/` |
| `/seller/` | `200`; assets under `/seller/assets/` |
| Hosted acceptance gate | **11/11 passed** |

The hosted acceptance gate verified health, unknown-identity rejection, owned customer
context, customer denial on privileged routes, operator `/metrics` and `/v1/ops/audit`,
owner-scoped notifications, device registration/removal, logout revocation and
`production_release_authorized: false`.

## Migration and rollback rehearsal

Performed on a clone of the live `buildkart_experience` database:

1. Forward apply through the new stores:
   - `pilot_shipment.version`
   - `pilot_return_case.version`
   - `pilot_return_event.operation_key`
   - `pilot_return_event_operation_uidx`
2. Ran the database-backed manual workflow test against the clone: pass.
3. Rolled back all three columns and the unique index: pass.
4. Re-applied through the stores: pass.
5. Re-ran the database-backed manual workflow test: pass.
6. Dropped the rehearsal database.

The rehearsal proved the additive schema is repeatable and does not depend on destructive
migration steps.

## Hosted UI end-to-end flow

Admin and Seller consoles were exercised against staging:

### Shipment — order `#109`
`order_01M5KZ7AXK08HZR3AVK3CCSJ82`, UrbanBuild allocation, tracking `SIM-0B631FF25F64`.

1. Admin moved `booked → picked_up` (v2).
2. Seller UrbanBuild moved `picked_up → in_transit` (v3).
3. Admin moved `in_transit → out_for_delivery` (v4).
4. Seller UrbanBuild recorded delivery with evidence and all five units (v5).
5. Final state: **Delivered, v5, 5 of 5 units**.

### Return — order `#91`
`order_01M5EWVP2CE3JBHFGBZZCAZXCW`, BuildMaster allocation, return `ret_40f91b…`.

1. Admin approved the requested return (v2).
2. Admin scheduled reverse pickup (v3).
3. Seller BuildMaster recorded receipt (v4).
4. Final state: **Received, v4**; no refund, payment mutation or stock movement.

Console errors: **0** on Admin, Seller and BuildMaster consoles.

## Accessibility and responsive checks

- axe-core WCAG 2.0/2.1/2.2 A/AA on hosted Admin: **0 violations, 0 incomplete, 22 passes**.
- axe-core WCAG 2.0/2.1/2.2 A/AA on hosted Seller: **0 violations, 0 incomplete, 21 passes**.
- Hosted accessibility tree exposes:
  - `Operational status`, `Delivery & fulfilment`, `Returns`, `Activity` headings;
  - `All shipments`, `All returns`, `View timeline` links with names;
  - delivered progress bars with names such as `5 of 5 units delivered`;
  - `Update shipment`, `System references`, `Technical details` controls.
- Hosted keyboard focus reached every visible workbench control.
- Local viewports checked: desktop `1440×1200`, tablet `834×1112`, mobile `390×844`.
- No horizontal overflow at mobile width.
- Screenshots:
  - `order-workbench-screenshots/admin-desktop.png`
  - `order-workbench-screenshots/admin-tablet.png`
  - `order-workbench-screenshots/admin-final.png`
  - `order-workbench-screenshots/seller-desktop.png`
  - `order-workbench-screenshots/seller-final.png`
  - `order-workbench-screenshots/hosted-admin-shipment.png`
  - `order-workbench-screenshots/hosted-seller-shipment.png`
  - `order-workbench-screenshots/hosted-admin-return.png`
  - `order-workbench-screenshots/hosted-seller-return.png`

## Local automated verification

| Check | Result |
| --- | --- |
| Experience API typecheck | pass |
| API package typecheck | pass |
| Admin panel build | pass |
| Seller panel build | pass |
| Changed panel ESLint | pass |
| `test:manual-transitions` | pass |
| `test:manual-transitions-db` | pass |
| `test:manual-transitions-http` | pass |
| `test:shipment-ordering` | pass |
| `test:shipment-restart` | pass |
| `test:shipment-reconcile` | pass |
| `test:return-idempotency` | pass |
| `test:seller-shipment-auth` | pass |
| `test:return-no-effects` | pass |
| `test:return-eligibility` | pass |
| `test:rbac` | pass |
| CHG-035 YAML parse | pass |

## Notes and exclusions

- The workbench uses container-adaptive tiles and a single-column activity trail so it
  remains correct inside Mercur's main column. It does not rely on viewport-wide
  Tailwind classes that the dashboard stylesheet may not emit.
- Payment and refund tiles use the native order payload and show `Not available` when
  fields are absent.
- `restocked`, `quarantined`, `refund_review` and `completed` remain intentionally
  excluded: they imply stock or money effects outside this increment.
- Real carrier integration is not part of CHG-035 revision 6. D-035-15 disables
  carrier automation; no carrier credentials or provider contract are in the repository.
  It requires a separate governed change.
- Physical screen-reader session on dedicated assistive hardware was not available in
  this environment. Automated axe, browser accessibility-tree and keyboard traversal
  checks were completed.
- Production release is not authorized and was not performed.
