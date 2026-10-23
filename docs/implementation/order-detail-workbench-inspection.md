# Order detail workbench — implementation record

Date: 2026-10-23  
Branch: `feat/order-detail-workbench`  
Status: local implementation complete; staging deployment and production release not authorized

## Delivered UI

- Admin order detail keeps the native Mercur order page and now renders one
  BuildKart workbench in `orders.detail.main.after`
  (`apps/admin/src/widgets/order-delivery-returns.tsx`).
- Seller order detail renders the same operational pattern in
  `apps/vendor/src/widgets/order-delivery-returns.tsx`.
- Each workbench contains:
  - one staging banner;
  - independent **Order, Payment, Allocation, Fulfilment, Delivery, Return,
    Refund, Inventory effect** tiles;
  - **Delivery & fulfilment** and **Returns** cards;
  - an activity timeline;
  - collapsed **System references** and permission-gated **Technical details**.
- Actions are permission-aware. Admin return approval/rejection remains an
  Admin decision; only operational return stages are available to Sellers.
- The all-or-nothing **Record delivery** action is removed. Delivery updates use
  per-line quantities and a proof reference. Incomplete quantities persist as
  `partially_delivered`.
- Admin and Seller shipment detail pages and both return detail pages now use
  the same versioned transition contract.

## Persisted shipment states

`services/experience-api/src/logistics/shipment-store.ts`:

- `booked`
- `ready_for_pickup`
- `picked_up`
- `in_transit`
- `delayed`
- `delivery_failed`
- `out_for_delivery`
- `delivery_attempted`
- `buyer_action_required`
- `partially_delivered`
- `damaged`
- `lost`
- `delivered`
- `returning_to_seller`
- `returned_to_seller`
- `rto_in_transit`
- `rto_delivered`
- `cancelled`

Each manual transition writes one append-only `pilot_shipment_event`, increments
the shipment version, and is covered by privileged audit. Events remain
append-only and provider replay still deduplicates by provider event ID.

## Persisted return states

`services/experience-api/src/store/return-store.ts`:

- `requested`
- `under_review`
- `approved`
- `rejected`
- `cancelled`
- `pickup_scheduled`
- `pickup_attempted`
- `in_return_transit`
- `received`
- `inspection_pending`
- `inspection_complete`
- `closed`

`approved` and `rejected` remain Admin decisions. Sellers can advance only
reverse-logistics stages for their own allocation. Every operational transition
stores `money_effect: "none"` and `stock_effect: "none"` and never calls Medusa
money APIs or Tryton.

## Manual transition contracts

- Admin: `POST /admin/buildkart/shipments/:id/status`,
  `POST /admin/buildkart/returns/:id/status`.
- Seller: `POST /vendor/buildkart/shipments/:id/status`,
  `POST /vendor/buildkart/returns/:id/status`.
- Both require `expected_version` and `operation_key`.
- Shipment updates require a reason; attempt states require an attempt number
  and reason; delay requires a revised date; buyer action requires a next
  action; delivery states require proof and per-line quantities.
- Return updates require an operating note.
- Stale versions return `409`; invalid transitions return `409`; Seller
  cancellation and cross-seller identifiers are refused.
- Seller reads are allocation-scoped through
  `GET /vendor/buildkart/orders/:id/delivery-returns`; there is no
  cross-seller read path.

## Residual gaps

- Payment, refund and native fulfilment tiles are derived from the native order
  payload supplied to the widget. Allocation and delivery come from the
  Experience projection. A future order-group read model should expose all
  dimensions as one authoritative payload rather than relying on native order
  fields being present on every Mercur version.
- `restocked`, `quarantined`, `refund_review` and `completed` are intentionally
  not return states: they imply stock or money effects outside this increment.
  `rejected` is the decline state and `closed` is the completion state.
- Controlled correction of an already-`delivered` shipment is not exposed;
  correction requires a governed reversal contract.
- Staging deployment and production release remain unauthorized. Local runtime
  verification is complete.

## Verification performed locally

- Experience API typecheck.
- API package typecheck.
- Admin and Seller production builds.
- Targeted ESLint on all changed panel files.
- Pure transition and partial-delivery contract test
  (`test:manual-transitions`).
- Database-backed manual transition test (`test:manual-transitions-db`).
- HTTP Admin/Seller transition and scoping test
  (`test:manual-transitions-http`).
- Existing shipment ordering, restart, reconcile, seller isolation, return
  idempotency, no-effects and eligibility tests.
- Local Admin/Seller UI flow on order `#15`: approve return, schedule pickup,
  advance shipment, record delivery and receipt, verify final persisted state.
- axe-core WCAG 2.0/2.1/2.2 A/AA checks: 0 violations on both workbenches.
- Keyboard traversal reached every workbench control.
- Desktop `1440×1200`, tablet `834×1112` and mobile `390×844` checks with no
  horizontal overflow.
- Screenshots recorded under
  `client-projects/client101/evidence/CHG-035/order-workbench-screenshots/`.

The workbench uses container-adaptive state tiles and a single-column activity
trail because Mercur renders the widget inside a ~740px main column; it does not
depend on viewport-wide Tailwind breakpoints that the dashboard stylesheet may
not generate.
