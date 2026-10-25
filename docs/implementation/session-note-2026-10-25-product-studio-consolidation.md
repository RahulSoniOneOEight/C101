# Product Studio consolidation — Admin and Seller

Date: 2026-10-25
Change: CHG-076
Lane: C — shared Admin/Seller product editor, metadata and pricing UI
Release: code complete; staging deployment blocked by SSH authentication
Environment: staging only
Production: not authorized

## Outcome

Admin and Seller now use the same Product Studio component for product create and
update.

- Admin can operate any product.
- Seller operates its own listings through the same component.
- Seller products is removed from Admin and Seller navigation.
- Product Studio remains nested under Catalogue → Products.
- The old offer-detail pricing widget is read-only and links to Product Studio.
- The native SEO widget no longer edits brand or search tags; Product Studio owns
  those listing fields.

## Product Studio changes

### Product details

The agreed details block is retained:

- title
- short and full description
- category
- product type
- brand
- manufacturer
- model / part number
- HSN / GST code
- unit of measure
- thumbnail URL with preview

### Search tags and specifications

- Search tags remain free text with suggestion chips.
- Specifications remain structured name/value/unit rows.
- Search tags are owned by Product Studio.
- The old product-search metadata widget now edits SEO only.

### Variants

- Options are custom-only.
- No mandatory Color option.
- No built-in New/Old option.
- Variant name is required for review.
- Variant details shown in the app are required for review.
- Variant image URL is optional and can differ per variant.
- SKU is required for review.
- EAN, UPC and barcode inputs are removed from the Product Studio variant UI.
- Existing EAN/UPC/barcode values remain in storage.
- Variant details and image are stored in variant metadata:
  - `buildkart_variant_details`
  - `buildkart_variant_image_url`

### Pricing

- B2C keeps list price, selling price and GST.
- B2C quantity tiers are not shown and are not used for new offers.
- B2B keeps list price, selling price, MOQ, GST and effective dates.
- B2B quantity tiers are structured rows, not a textarea.
- No manual reason-for-change field is shown for B2C, B2B or bulk reference pricing.
- The server-side above-20% reason requirement is removed.
- Bulk reference pricing keeps list price and GST preservation, and now blocks the
  whole operation with a clear message when the proposed list price is below an
  existing base selling price.

### Review and publish

- Review is a compact status check.
- Status labels:
  - Draft
  - Needs attention
  - In review
  - Published
- Required blockers include:
  - product title and category
  - at least one variant
  - every variant has a name
  - every variant has details
  - every variant has a SKU
  - every variant has an INR offer price
- Submit/approve/publish and lifecycle actions remain available.
- No separate review page.

## Files

- `services/backend/apps/admin/src/routes/product-studio/studio-form.tsx`
- `services/backend/apps/vendor/src/routes/product-studio/studio-form.tsx`
- `services/backend/apps/admin/src/_navigation.ts`
- `services/backend/apps/vendor/src/_navigation.ts`
- `services/backend/apps/admin/src/widgets/offer-pricing.tsx`
- `services/backend/apps/vendor/src/widgets/offer-pricing.tsx`
- `services/backend/apps/admin/src/widgets/product-search-metadata.tsx`
- `services/backend/apps/vendor/src/widgets/product-search-metadata.tsx`
- `services/backend/packages/api/src/lib/product-studio.ts`
- `services/backend/packages/api/src/lib/offer-pricing.ts`

## Verification

- Admin production build: pass.
- Seller production build: pass.
- API TypeScript check: pass.
- Targeted lint on changed widgets and navigation: pass.
- Product Studio lint still reports the pre-existing
  `react-hooks/set-state-in-effect` findings; no new lint error was introduced.

## Staging verification pending

Deployment attempt on 2026-10-25 was blocked: SSH to `89.116.20.164` rejects the
`~/.ssh/buildkart_deploy` key (`Permission denied (publickey,password)`), even
though the key loads with its recorded passphrase. Password authentication also
failed. Staging remains on the previous release.

- Confirm Admin and Seller navigation no longer shows Seller products.
- Open Product Studio from Products in both portals.
- Create a seller-owned draft and verify variant details/image persistence.
- Verify EAN/UPC/barcode inputs are absent.
- Verify B2C pricing has no quantity tiers and no reason field.
- Verify B2B tiers are structured rows and save correctly.
- Verify review status and publish/submit actions.
- Verify Seller cannot open another seller's product.
- Verify Admin can open and edit any product.
- Verify console errors are zero.

## Residual limitations

- Seller published-product editing remains governed by the existing review model;
  this bundle permits seller operation of own drafts.
- Seller products route may still be reachable by direct URL while hidden from
  navigation.
- B2B price-list consumption by the B2B storefront remains a separate pricing
  read-path issue.
- Production remains unauthorized.
