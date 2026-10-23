# Product studio — B2C pricing policy extension

Date: 2026-10-23  
Lane: B/C (offer metadata + pricing validation + studio UI)  
Release: `a44a283`  
Status: staging verified; production unauthorized

## Delivered

- List price per seller offer, stored in `offer.metadata.list_price_minor`
  (the same field already used by the storefront read model).
- GST-inclusive flag per offer, stored in `offer.metadata.gst_inclusive`.
- Server-side enforcement:
  - list price required when studio policy is active
  - selling price cannot exceed list price
  - price increases above 20% require a reason
- Studio pricing card:
  - list price
  - selling price
  - GST-inclusive checkbox
  - discount percentage
  - current list and selling display
- Bulk reference pricing:
  - applies list price and GST setting to every offer that already has a
    selling price
  - preserves selling prices and quantity tiers
- Price-change audit now records before/after list price and GST setting.

## Verification evidence

- API set list `₹1,000`, selling `₹800`, GST-exclusive: pass.
- API rejected selling `₹1,100` above list `₹1,000`: pass.
- API rejected an increase from `₹900` to `₹1,300` without a reason: pass.
- The same change with a reason: pass.
- Studio UI rendered list price, GST checkbox, discount percentage and bulk
  panel.
- Bulk reference pricing updated the offer and preserved its selling price.
- Temporary QC product, offer and inventory item were removed.

## Boundaries

- B2B price lists, MOQ, effective dates, policy floors beyond selling ≤ list
  and the >20% reason hold remain separate.
- Storefront fixture already reads `offer.metadata.list_price_minor`; this
  extension makes it governable from the studio.
- Existing seller/admin pricing widgets do not send policy fields and retain
  their previous behavior.
- No second price table is introduced.

## Open items

1. B2B price lists and MOQ.
2. Effective dates.
3. Floor-price override authority.
4. Inventory approval workflow and direct Tryton posting policy.
5. Published-edit review, pause/archive/unpublish, acting-for and RBAC.
6. Production readiness evidence and human authorization.
