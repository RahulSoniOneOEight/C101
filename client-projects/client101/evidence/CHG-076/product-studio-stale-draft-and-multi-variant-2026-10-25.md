# Product Studio stale-draft recovery and multi-variant save

Date: 2026-10-25
Scope: Admin and Seller Product Studio on staging.
Release: `eaf47a0`
Production: not touched.

## Reported issue

Logging into Product Studio showed:

```text
An error occurred
An unexpected error occurred while rendering this page.
```

## Root cause

The new-product form restores an unsaved local draft from browser storage.
The restore path trusted the old draft shape and applied it directly to React
state. A draft with missing variant options, option values stored as a string,
or a variant without a title crashed the page during render.

Three malformed draft shapes reproduced the exact error boundary:

- variants with no `options` object
- option `values` stored as a comma-separated string
- a variant with no `title`

## Fix

The Admin and Seller forms now normalise a local draft before applying it:

- form fields are coerced to strings
- specifications and tags are checked as arrays
- option values accept arrays or comma-separated strings
- variants are merged onto the default variant shape
- variant options are rebuilt as a string map
- an invalid draft is removed instead of crashing the page

Both forms share the same implementation.

## Verification

Malformed-draft recovery:

- Admin malformed drafts: page loads, no error boundary, draft restored.
- Seller malformed draft: page loads, no error boundary, draft restored.
- Admin console errors: `0`.
- Seller page errors: `0`.

Multi-variant creation and save:

- Created a temporary draft through Admin Product Studio:
  - Product: `QC Multi Variant 2026-10-25`
  - Product ID: `prod_01M5SJHTE1B0NJVV4DCXZE0062`
  - Option: `Finish`
  - Values: `Black`, `Silver`
  - Generated variants: `2`
- Saved with **Create draft**.
- Reloaded the product and verified the form values:
  - `Black` — `QC-MV-20261025-BLK` — `Black powder-coated finish`
  - `Silver` — `QC-MV-20261025-SLV` — `Silver powder-coated finish`
- Database verification:
  - two `product_variant` rows exist for the product
  - both SKUs and `buildkart_variant_details` values are persisted
  - option `Finish` has values `Black` and `Silver`
- Console errors: `0`.
- The test product remains an unpublished draft for inspection.

## Screenshots

- `client-projects/client101/evidence/CHG-076/product-studio-multi-variant-saved.png`
- `client-projects/client101/evidence/CHG-076/product-studio-multi-variant-verified.png`

## Notes

- The earlier Product Studio smoke check found that existing catalogue variants
  have no `buildkart_variant_details`. That remains a data-migration gap.
- The multi-variant test product proves the create/save path works for new
  products; it does not backfill legacy variant details.
