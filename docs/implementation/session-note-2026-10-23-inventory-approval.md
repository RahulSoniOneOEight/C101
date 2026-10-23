# Inventory adjustment approval flow

Date: 2026-10-23  
Lane: B/C (request store + admin decision + studio UI)  
Status: staging verified; Tryton stock unchanged; production unauthorized

## Delivered

- Durable `inventory_adjustment_request` table in the experience database.
- Seller/admin request creation now writes a request row and keeps the existing
  domain event audit.
- Admin list of requests with status, seller, SKU, quantity, reason and decision.
- Admin approve and reject actions, each recording actor, timestamp and note.
- Approval and rejection emit `inventory.adjustment_approved` or
  `inventory.adjustment_rejected` domain events with `stock_effect: none`.
- Seller and admin product studio show the latest three requests for the
  current offer.
- No Tryton movement, reservation or stock write is performed by this flow.

## Verification evidence

- Created request `invreq_c104413fb45445b4984fdd6e4160d550` for `+5`.
- Listed it under `status=requested`.
- Approved it; status became `approved`, actor `user_01M4EJ2PMVCPDP1FEZV5Q4TJ75`.
- Created and rejected a second request for `-3` with a decision note.
- Both responses reported `stock_effect: none`.
- Admin UI loaded the request page and displayed the request and boundary text.
- Temporary QC requests were deleted.
- Five inventory audit events remain as staging evidence.

## Boundaries

- Approval is a recorded decision, not an ERP posting.
- Direct Tryton posting still requires an approved posting policy, operator
  identity and reconciliation/rollback design.
- Request creation remains limited to `role_seller_administration` on the
  seller side.

## Open items

1. ERP-operator posting step and reconciliation.
2. B2B price lists, effective dates and floor authority.
3. Published-edit review, pause/archive/unpublish.
4. Admin acting-for and RBAC role templates.
5. Production evidence and human authorization.
