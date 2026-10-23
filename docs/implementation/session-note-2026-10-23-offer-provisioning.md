# Product studio — offer provisioning delivery

Date: 2026-10-23  
Lane: C  
Release: `1490981`  
Status: staging verified; production unauthorized

## Delivered

- New seller-owned studio variants now receive:
  - one seller offer per variant
  - one inventory item per offer
  - seller inventory-item link
  - zero stock levels
  - no price until the seller enters one
- Offer provisioning runs after variant create and after variant changes.
- Existing seller offers are reused; duplicate offers are not created.
- Shipping profile resolution:
  1. the seller's existing offer shipping profile
  2. the first staging shipping profile as fallback
- New offers are created with `manage_inventory: false` and no price rows.
- Pricing section becomes immediately usable after provisioning.
- Inventory section shows the offer SKU and Tryton state.
- Review readiness can now be completed by entering an INR base price.

## Verification evidence

- Seller UI created a two-variant product.
- Backend created two offers under BuildMaster Supplies with the expected SKUs
  and one inventory item each.
- Pricing cards rendered for both variants with “No base price”.
- Seller entered `₹100` and `₹120`.
- Review readiness became complete; Submit for review became enabled.
- Seller submission moved the product to Review required.
- Admin approval published the product.
- Temporary product, offers and inventory items were deleted after the test.

## Assumptions and boundaries

- The seller's existing shipping profile is the preferred default.
- A first-profile fallback is used only when the seller has no offer profile.
  This needs an explicit shipping-profile assignment decision before
  production.
- Inventory items are created with no stock levels. Tryton remains the stock
  authority; this is item existence, not stock.
- No price is invented; the seller must enter it.
- If no shipping profile exists, provisioning is skipped and pricing remains
  blocked.
- Offer provisioning is seller-scoped in this bundle. Admin-created master
  products still require a seller offer.
- No B2B, MOQ, effective dates, GST flag, policy floor or direct Tryton posting
  is included.

## Remaining program items

1. CHG-074 pricing extensions.
2. Inventory approval workflow and direct Tryton posting policy.
3. Published-product edit review, pause/archive/unpublish, acting-for and RBAC.
4. Production readiness evidence and human authorization.
