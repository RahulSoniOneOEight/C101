# Order detail workbench — implementation record

Date: 2026-10-23  
Branch: `feat/order-detail-workbench`  
Status: staging deployed and verified at `release-5628fca`; production release not authorized

## Delivered order-page UI

The Admin and Seller order pages now keep the native Mercur order summary, payment and fulfilment
sections, and add only two BuildKart cards:

- **Delivery**
- **Returns**

The following inferred UI was removed from the order page:

- Operational status tiles
- Staging manual operations banner
- Technical details

The order page also keeps a compact Activity timeline and collapsed System references.

## Delivery statuses

The order-page delivery dropdown exposes only:

- **Dispatched**
- **In Transit**
- **Out For Delivery**
- **Delivered**

Only valid forward transition options are shown. The status is applied to the seller shipment /
allocation, which is the persisted delivery unit. Terminal shipments do not show an update control.

The backend still stores legacy and exception states for existing data and shipment detail pages,
but they are not exposed as order-page delivery options.

## Return statuses

The order-page returns section exposes only:

- **Schedule Return**
- **Waiting For Pickup**
- **Return Completed**

`Schedule Return` is the operational label after Admin approval. `Waiting For Pickup` maps to the
scheduled pickup stage. `Return Completed` is terminal. Completed legacy cases are displayed as
`Return Completed` and do not show an extra update control.

Admin retains approve/reject authority. Seller updates remain scoped to the seller's allocation.
No return transition creates a refund, payment mutation, Medusa money effect or Tryton stock move.

## Payment and refund

Payment and refund remain in the native Medusa order sections. This workbench does not duplicate
payment capture, refund approval or refund execution. No payment/refund status vocabulary was
supplied for manual order-page overrides, so none was added.

## Backend contracts

- Admin: `POST /admin/buildkart/shipments/:id/status`,
  `POST /admin/buildkart/returns/:id/status`.
- Seller: `POST /vendor/buildkart/shipments/:id/status`,
  `POST /vendor/buildkart/returns/:id/status`.
- Seller read: `GET /vendor/buildkart/orders/:id/delivery-returns`.
- Every transition requires the current version and an operation key.
- Shipment events and return events are append-only and audited.
- Stale versions return `409`; invalid transitions return `409`; seller cancellation is refused.
- Delivered still requires complete per-line quantities and a proof reference; the simplified order
  page supplies a staging proof reference and full quantities for the whole seller shipment.

## Residual gaps

- **Selected-SKU delivery status is deferred.** The persisted unit is the seller shipment. A
  line-level delivery-status contract has not been supplied, so the order page does not fake
  selected-SKU status.
- Legacy backend states remain readable for existing data; the order page hides them.
- Real carrier integration is a separate governed change. Carrier automation is disabled by
  D-035-15.
- Production release remains unauthorized.

## Verification

Local:

- Experience API typecheck; API package typecheck.
- Admin and Seller production builds.
- Changed panel ESLint.
- `test:manual-transitions`, `test:manual-transitions-db`, `test:manual-transitions-http`.
- Shipment ordering, restart and reconcile; return idempotency, no-effects and eligibility.
- Local UI flow: Dispatched → In Transit → Out For Delivery → Delivered; Schedule Return →
  Waiting For Pickup → Return Completed.
- No operational tiles, banner or Technical details in either console.
- Console errors: 0.

Hosted staging (`release-5628fca`):

- Public health and both dashboards return `200`.
- Admin delivery options verified for a booked shipment: only `Dispatched`.
- Admin completed return displays `Return Completed` with no extra update control.
- Seller page hides removed sections and terminal update controls.
- Console errors: 0.
- Hosted acceptance remains 11/11.
- Migration forward/rollback/re-apply rehearsal passed for the schema added by this increment.

Screenshots:

- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/hosted-simplified-delivery.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/hosted-simplified-return.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/hosted-simplified-seller.png`

## Staging release

- Release: `/opt/buildkart-releases/release-5628fca`
- Current symlink: `/opt/buildkart-releases/current`
- Admin: `https://ops-staging.pinakaplay.cloud/dashboard/`
- Seller: `https://ops-staging.pinakaplay.cloud/seller/`
- Production release: not authorized.
