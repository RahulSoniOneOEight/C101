# Product Studio smoke check — 2026-10-25

Scope: Admin and Seller Product Studio on staging.
Mode: read/load checks plus one no-change pricing save.
Production: not touched.

## Test identity and product

- Admin: `admin@buildkart.test`.
- Seller: `buildmaster@mercur.dev` (BuildMaster Supplies).
- Product: `prod_01M59JHKBZ41EJTYW3X6MCXZC6`
  (`1/2in Drive 24 Pcs Socket Set`, published).
- Offers:
  - `offer_01M59JHN9EP8RGG9MVGEJ33MSS` — Set - Hex.
  - `offer_01M59JHN9ECDEA5NEGH8996X6T` — Set - Bi Hex.

## Passed

- Admin login and Product Studio navigation: pass.
- Admin Product Studio list loads eight draft products: pass.
- Admin existing published product loads: pass.
- Admin product details, category, brand, thumbnail and variants load: pass.
- Admin B2C pricing loads: `₹4,750` list, `₹4,275` selling for Set - Bi Hex.
- Admin B2B pricing loads: `₹4,750` list, `₹3,990` selling, MOQ `5`,
  tiers `5-9 @ ₹3,890` and `10+ @ ₹3,790`.
- Admin no-change `Save pricing` succeeds with feedback:
  `B2B price saved in the dedicated customer-group price list.`
- Persisted values after save are unchanged:
  - B2C `4750 / 427500` minor units.
  - B2B `4750 / 399000`, MOQ `5`, tiers `389000` and `379000`.
- B2B storefront still reads `399000`, MOQ `5` and the same tiers after the save.
- Seller login, store selection and Product Studio navigation: pass.
- Seller can open its own published product in Product Studio: pass.
- Seller pricing and variant sections load the same values: pass.
- Admin and Seller sidebar no longer shows `Seller products`: pass.
- Console errors on Admin Product Studio: `0`.
- Console errors on Seller Product Studio: `0`.

## Finding — legacy variant details are empty

Review shows a required blocker:

```text
Every variant has details shown in the app *   Missing
```

Both `Details shown in app` textareas are present and editable, but they are
empty on this published product. The same result appears in Admin and Seller.

A staging database check found no product variant with
`buildkart_variant_details` populated:

```sql
select count(*)
from product_variant
where coalesce(metadata->>'buildkart_variant_details','') <> '';
-- 0
```

Impact:

- Existing published products remain visible in the storefront.
- Editing or re-publishing any existing product is blocked by Review until every
  variant has customer-facing details.
- This is a data-migration gap, not a form-load or save failure. The validator is
  behaving as designed.

Recommended options:

1. Backfill legacy variants with approved customer-facing copy.
2. Treat variant details as a warning for legacy products and a blocker for new
   products.
3. Leave the blocker in place and require sellers/operators to fill details when
   they next edit a product.

No option was applied in this check.

## Other data gaps on the test product

- Short description: empty.
- Full description: empty.
- Manufacturer, model/part number, HSN/GST code and unit of measure: empty.
- Search tags and specifications: empty.

These are pre-existing catalogue data gaps, not Product Studio failures.

## Screenshots

- `client-projects/client101/evidence/CHG-076/admin-product-studio.png`
- `client-projects/client101/evidence/CHG-076/admin-product-studio-published.png`
- `client-projects/client101/evidence/CHG-076/admin-pricing-saved.png`
- `client-projects/client101/evidence/CHG-076/seller-product-studio-published.png`
