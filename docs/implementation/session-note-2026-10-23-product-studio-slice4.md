# Product studio Slice 4 — inventory visibility and requests

Date: 2026-10-23  
Lane: C (shared product editor + Tryton read/request integration)  
Release: `1f9c711`  
Status: staging verified; production unauthorized

## Delivered

- Tryton stock summary per offer SKU:
  - on hand
  - reserved from assigned moves
  - ATP
  - draft moves
- Per-location breakdown for Tryton storage locations.
- Read-only staging reservation-ledger figures, explicitly labelled as fixture
  data and not Tryton.
- Audited stock adjustment request:
  - offer and SKU scoped
  - non-zero integer quantity delta
  - mandatory reason
  - actor and role recorded
  - `stock_effect: none`
- Admin routes:
  - `POST /admin/buildkart/inventory/summary`
  - `POST /admin/buildkart/inventory/requests`
- Seller routes:
  - `POST /vendor/buildkart/inventory/summary`
  - `POST /vendor/buildkart/inventory/requests`
- Seller summary is limited to the seller's own offer SKUs.
- Seller adjustment requests require `role_seller_administration`.

## Verification evidence

- Admin summary for a synced SKU returned a Tryton product, zero on-hand,
  zero reserved, zero ATP and one draft move.
- Admin summary for a non-synced SKU returned `found: false`.
- Admin UI rendered Tryton metrics and the location table.
- Admin request recorded `inventory.adjustment_requested` with reason and
  `stock_effect: none`.
- Tryton `stock_move` count stayed at 51.
- Medusa API and Experience API both healthy after deployment.

## Safety boundaries

- Tryton remains the inventory authority.
- The staging reservation ledger is fixture data and is not presented as
  Tryton stock.
- Direct Tryton stock posting is not implemented.
- No reserved or committed quantity is written by the studio.
- No low-stock threshold or non-stock policy is invented.
- No stock location selector is implemented yet; locations are displayed
  read-only.
- New studio variants still need offer/inventory provisioning before inventory
  is available.
- One staging QC adjustment request audit event remains; it has no stock
  effect.

## Open items

1. Slice 5: ProductChange submission, review and publish.
2. Decide opening-stock and direct-adjustment authority for Tryton.
3. Add low-stock threshold and non-stock policy.
4. Add a location selector once per-location adjustment is approved.
5. Provision offers and inventory items for newly created studio variants.
6. Remove or accept the staging QC inventory request event under the audit
   retention policy.
