# ERP-controlled Tryton posting evidence

Date: 2026-10-23  
Release: `8c0b76d`  
Status: staging verified for posting, idempotency and reconciliation

## What failed and why

Tryton `stock.move.origin` and `stock.move.shipment` are `fields.Reference`,
not free-text fields. Passing the operation key produced:

`invalid input syntax for type integer`

Posting now relies on the BuildKart `inventory_adjustment_posting` unique
`request_id`/`operation_key` guard for idempotency.

Posting also required:

- `cost_price: 0`
- `effective_date`
- `planned_date`

## Verified flow

1. Created an approved adjustment for SKU
   `OFFER-GYC2-POWEREXANGLEGRINDER4INCH850W-STD-1`, quantity `+1`.
2. Approval alone created no Tryton movement.
3. ERP Operator posted it: `tryton:stock.move:57`, state `done`, quantity `1`.
4. Repeating the post returned `idempotent=true` and the same move `57`.
5. Reconciliation returned `matches=true`, `reconciled/matched`.
6. Created and posted a compensating `-1`: `tryton:stock.move:58`.
7. Reconciliation of the compensating move returned `matches=true`.
8. Two orphan draft moves from failed attempts (`55`, `56`) were cancelled.

Final Tryton move state:

| Move | State | Quantity |
|---|---|---|
| 55 | cancelled | 1 |
| 56 | cancelled | 1 |
| 57 | done | 1 |
| 58 | done | -1 |

Net stock effect is zero.

## Boundaries

- Posting is synchronous, not a background command queue.
- Duplicate HTTP retries are idempotent through the posting table.
- Response-loss after Tryton create but before the posting row update still
  needs a reconciliation-first retry policy.
- No direct database edits are used for posting.

## Cleanup

QC adjustment requests and posting rows were deleted after verification.
Tryton moves 57/58 remain as staged test evidence; 55/56 are cancelled.
