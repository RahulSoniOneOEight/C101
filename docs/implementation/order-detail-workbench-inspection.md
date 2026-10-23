# Order detail workbench — implementation record

Date: 2026-10-23  
Branch: `feat/order-detail-workbench`  
Status: staging deployed and verified; latest runtime `release-9cceaae`; production release not authorized

## Delivered order-page UI

The Admin and Seller order pages now keep the native Mercur order summary, payment and fulfilment
sections, and add a BuildKart operations surface:

- **Admin:** an `Order operations` status strip at the top with Payment, Refunded, Delivery and
  Return tiles, followed by the Delivery and Returns cards.
- **Seller:** a `Delivery and returns` status strip at the top with Delivery and Return tiles,
  followed by the same cards without payment or refund information.
- **Both:** terminal delivery and return cards state that no further updates are available; completed
  returns show the native refunded amount on Admin.

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
payment capture, refund approval or refund execution. The Admin status strip reads
`payment_status` and `summary.refunded_total`; it does not mutate either. No payment/refund status
vocabulary was supplied for manual order-page overrides, so none was added.

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
- Admin status strip renders Payment, Refunded, Delivery and Return from order and lifecycle data.
- Seller status strip renders Delivery and Return only; no payment or refund values.
- Desktop 1440 and mobile 390 layouts have no horizontal overflow.
- Console errors: 0.

Hosted staging (`release-cfe2f25`):

- Public health and both dashboards return `200`.
- Admin order #113: status strip is the first order section, with Partially Refunded ₹15,300,
  Delivered 2 of 2 and Return Completed 1 unit.
- Admin delivery/return cards show terminal-state messaging and no update controls.
- Seller order #113: status strip shows Delivered 2 of 2 and Return Completed 1 unit; no payment or
  refund tile is exposed.
- Seller page hides removed sections and terminal update controls.
- Console errors: 0.
- Order #113 remained available after the staging container recreation.
- Hosted acceptance remains 11/11 from the prior runtime release; no API or schema changed here.
- Migration forward/rollback/re-apply rehearsal remains valid; no schema changed in this UI bundle.

Screenshots:

- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-workbench-admin-header.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-workbench-admin-desktop.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-workbench-admin-mobile.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-workbench-admin-full.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-workbench-seller-header.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/qc-workbench-seller-desktop.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/hosted-simplified-delivery.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/hosted-simplified-return.png`
- `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/hosted-simplified-seller.png`

## Staging release

- Release: `/opt/buildkart-releases/release-9cceaae`
- Current symlink: `/opt/buildkart-releases/current`
- Admin: `https://ops-staging.pinakaplay.cloud/dashboard/`
- Seller: `https://ops-staging.pinakaplay.cloud/seller/`
- Production release: not authorized.
