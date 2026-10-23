# Order workbench end-to-end verification — 2026-10-23

Change: CHG-035 revision 6, manual order workbench increment
Branch: `feat/order-detail-workbench`
Scope: local end-to-end verification against the repository's Postgres, Redis, NATS, Mercur backend and both dashboards. No staging deployment, push, merge or production authorization.

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

## Local runtime

- Docker Desktop started.
- `postgres:16.15-alpine`, `redis:7.4.10-alpine` and `nats:2.10-alpine` healthy.
- Mercur backend running on `http://localhost:9010`.
- Experience API running on `http://localhost:9020`.
- Admin dashboard running on `http://localhost:7000/dashboard`.
- Seller dashboard running on `http://localhost:7001/seller`.
- Admin login: `admin@buildkart.test`.
- Seller login: `urbanbuild@mercur.dev` with the UrbanBuild store selected.
- Test order: `order_01M490YGEFNKCH1N454A4CGH7T` (`#15`), order group
  `og_01M490YGHG774F1NZQNPMEVR73`.

## Automated verification

| Check | Result |
| --- | --- |
| Experience API `tsc --noEmit` | pass |
| API package `tsc --noEmit` | pass |
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
| `test:return-no-effects` | pass |
| `test:return-eligibility` | pass |
| `test:shipment-auth` | pass; operator branch skipped without explicit env |
| `test:seller-shipment-auth` | pass |
| `test:rbac` | pass |
| CHG-035 YAML parse | pass |

### Database contract coverage

`test:manual-transitions-db` proves:

- booked → picked up → in transit → out for delivery → partially delivered → delivered;
- idempotent replay does not create a second event or version;
- stale versions return `shipment-version-conflict`;
- partial quantities persist as `partially_delivered` and cannot be submitted as `delivered`;
- an all-full quantity set cannot be submitted as `partially_delivered`;
- return approval, operational pickup, receipt, idempotent replay and stale-version refusal;
- return status events contain `money_effect: "none"` and `stock_effect: "none"`.

### HTTP contract coverage

`test:manual-transitions-http` proves against the running Experience API:

- Admin shipment transition;
- Seller shipment read/update within its allocation;
- cross-seller shipment and return reads return `404`;
- seller cancellation returns `403` for shipment and `409` for return;
- Admin return approval;
- seller operational return update after approval;
- Admin cannot use the operational route to re-open/approve a return;
- seller order-group delivery/returns read is scoped to the seller.

## UI end-to-end flow

Admin console:

1. Opened order `#15` and loaded the workbench.
2. Approved the requested return.
3. Scheduled reverse pickup.
4. Advanced the shipment from in transit to out for delivery.
5. Reloaded after Seller actions and verified `Delivered` and `Received`.

Seller console:

1. Logged in as UrbanBuild and selected the UrbanBuild store.
2. Opened the same order and saw only its own allocation.
3. Recorded delivery with evidence and a delivered quantity.
4. Recorded return receipt.
5. Activity timeline showed the return decision, status change and shipment delivery.

Result: final Admin and Seller pages showed shipment v5 `Delivered` and return v4 `Received`.

Console errors: **0** on both consoles.

## Accessibility and responsive checks

- axe-core WCAG 2.0/2.1/2.2 A/AA scan on the Admin workbench:
  **0 violations, 0 incomplete, 21 passes**.
- axe-core scan on the Seller workbench:
  **0 violations, 0 incomplete, 20 passes**.
- Keyboard focus reached every workbench control:
  - All shipments
  - View timeline
  - Update shipment
  - All returns
  - View return
  - return stage select
  - operating reason input
  - Update return
  - System references
  - Technical details (Admin only)
- Viewports checked:
  - desktop `1440×1200`;
  - tablet `834×1112`;
  - mobile `390×844`.
- No horizontal overflow: document and section `scrollWidth` equal the viewport width at
  mobile size.
- Screenshots:
  - `order-workbench-screenshots/admin-desktop.png`
  - `order-workbench-screenshots/admin-tablet.png`
  - `order-workbench-screenshots/admin-final.png`
  - `order-workbench-screenshots/seller-desktop.png`
  - `order-workbench-screenshots/seller-final.png`

## Notes

- The Seller panel build prints a pre-existing dashboard warning that the Medusa config refused
  to load when `NODE_ENV=production` and simulated payment was enabled. The build completed; the
  warning is a build-time environment check, not a workbench failure.
- Payment and refund tiles rely on the native order payload. They show `Not available` when the
  payload omits those fields rather than implying a state.
- `restocked`, `quarantined`, `refund_review` and `completed` remain intentionally excluded
  because they imply stock or money effects outside this increment.

## Not performed

- Staging deployment.
- Production release.
- Migration and rollback rehearsal on a staging database.
- Real carrier integration.
- Browser testing with physical assistive technology; automated axe and keyboard traversal were
  used.

## Authorization

- Staging deployment: not authorized in this increment.
- Production release: not authorized.
