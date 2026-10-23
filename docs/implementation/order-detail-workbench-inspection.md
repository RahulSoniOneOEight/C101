# Order detail workbench — inspection and blockers

Date: 2026-10-23  
Branch: `feat/order-detail-workbench`  
Status: inspection complete; runtime UI not changed

## Existing UI

- Admin order detail is the native Mercur order page.
- BuildKart injects one widget in `orders.detail.main.after`:
  `apps/admin/src/widgets/order-delivery-returns.tsx`.
- The widget renders only **Shipment** and **Returns**, plus two raw references.
- It has a single **Record delivery** button that records all ordered units as
  delivered and a link to the shipment page.
- There is no admin order-detail widget for payment, allocation, status
  dimensions, activity timeline, reconciliation or technical details.
- Seller order detail is entirely native Mercur; there is no seller
  delivery/returns widget.
- Admin shipment detail page is
  `apps/admin/src/routes/shipments/[id]/page.tsx`.
- Admin returns list is `apps/admin/src/routes/returns/page.tsx`; there is no
  create-return action on the order page.

## Backend shipment states that can be persisted

`services/experience-api/src/logistics/shipment-store.ts`:

- `booked`
- `picked_up`
- `in_transit`
- `delivery_failed`
- `out_for_delivery`
- `damaged`
- `lost`
- `delivered`
- `rto_in_transit`
- `rto_delivered`
- `cancelled`

Events are append-only in `pilot_shipment_event`.

Admin persistence today:

- `POST /admin/buildkart/shipments/:id/simulate-event` accepts only
  `failed_attempt | delay | damaged | lost | rto | duplicate | out_of_order`.
- `POST /admin/buildkart/shipments/:id/delivery-evidence` records proof and
  per-line delivered quantities.
- There is **no admin status-transition endpoint**.
- There is a seller status endpoint with only:
  `picked_up, in_transit, out_for_delivery, delivery_failed, delivered,
  rto_in_transit`.

## Backend return states that can be persisted

`services/experience-api/src/store/return-store.ts`:

- `requested`
- `approved`
- `rejected`
- `cancelled`
- `pickup_scheduled`
- `received`
- `closed`

There is no generic return-status endpoint beyond approve/reject. Return
approval does not issue a refund, restock inventory or create a Tryton move.

## Required states that are currently BLOCKED

### Shipment

- `ready_for_pickup`
- `delayed`
- `delivery_attempted`
- `buyer_action_required`
- `returning_to_seller`
- `returned_to_seller`
- explicit partial-delivery state
- controlled delivered-state correction

Reason: no admin transition API and no event contract for attempt reason,
next action, revised date, evidence reference, customer notification, or
optimistic locking.

### Returns

- `under_review`
- `declined` (only `rejected` exists)
- `pickup_attempted`
- `in_return_transit`
- `inspection_pending`
- `inspection_complete`
- `restocked`
- `quarantined`
- `refund_review`
- `completed`

Reason: no transition API or persistence fields beyond approve/reject.

### Order/payment/allocation dimensions

The widget does not receive native order, payment, allocation, fulfilment,
refund or inventory status. It cannot render independent badges without a new
read model or additional native queries.

## Required backend extension before UI work

1. Add shipment statuses and a transition map:
   `ready_for_pickup`, `delayed`, `delivery_attempted`,
   `buyer_action_required`, `partially_delivered`, `returning_to_seller`,
   `returned_to_seller`.
2. Add `POST /admin/buildkart/shipments/:id/status` with:
   expected version, reason rules, attempt fields, revised date, evidence
   reference, customer notification, audit and append-only event.
3. Change delivery evidence so a partial line delivery records
   `partially_delivered`, never `delivered`.
4. Add a return transition API and status model, with explicit separation from
   refund, Tryton restock and payment.
5. Add a seller-scoped order-group delivery/returns read model and transition
   routes, or no seller widget.
6. Add native order/payment/allocation read fields to the order-group delivery
   response, or render them from separate native queries.

## UI work that is safe without backend changes

- Rename **Shipment** to **Delivery & Fulfilment**.
- Replace the repeated staging warning with one page-level banner.
- Rename **References** to **System references** and collapse it.
- Replace the return empty-state sentence with the requested intentional empty
  state.
- Show seller ID under Technical details.
- Remove the all-or-nothing **Record delivery** action only when the partial
  delivery contract exists; otherwise leave it disabled rather than simulate.

The `Update shipment` menu and drawer must not be added until the transition API
exists. Hiding or simulating unsupported states would violate the acceptance
criteria.

## Recommended next step

Implement shipment transition and partial-delivery persistence first, then the
admin widget and seller widget. Return lifecycle and RBAC/audit UI follow in a
second package.
