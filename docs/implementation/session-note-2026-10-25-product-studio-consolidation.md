# Product Studio consolidation — Admin and Seller

Date: 2026-10-25
Change: CHG-076
Lane: C — shared Admin/Seller product editor, metadata and pricing UI
Release: `17109f8`
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

### Seller direct edit and audit

- Seller can open its own published products in Product Studio.
- Saving a seller edit updates the listing directly.
- Each seller product update records `seller.product.updated` in the Experience event store.
- Admin Seller activity shows the update with seller name, product name, `Direct seller edit`, and a link into Product Studio.
- Admin can open the same Product Studio record and take corrective action.

### One pricing save action

- Each offer now has one `Save pricing` action instead of separate B2C and B2B save buttons.
- It saves B2C pricing and configured B2B pricing in sequence.
- B2C remains list price, selling price and GST.
- B2B remains list price, selling price, MOQ, tiers and effective dates.

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

## Staging deployment

Release: `17109f8`

- `/opt/buildkart-releases/current` points to `/opt/buildkart-releases/release-17109f8`.
- `medusa-api` healthy; `medusa-worker` running.
- Proxy restarted.
- Admin, Seller, ERP and API health endpoints return `200`.

## Live QC

Admin, `https://ops-staging.pinakaplay.cloud/dashboard/`:

- Seller products is absent from the sidebar.
- Catalogue remains visible with Collections, Categories and Product Studio.
- Product Studio opens from Catalogue.
- Variant name, details shown in app, optional image URL and SKU are visible.
- EAN, UPC and barcode inputs are absent.
- B2C has list price, selling price and GST only; no quantity tiers.
- B2B has list price, selling price, MOQ, effective dates and structured tier rows.
- No reason-for-change text box is present in B2C, B2B or bulk reference pricing.
- Review shows a compact status check and blockers.
- Pricing exposes one `Save pricing` action per offer.
- Seller activity shows a direct seller product update with the seller name and a Product Studio link.
- Console errors: 0.

Seller, `https://ops-staging.pinakaplay.cloud/seller/`:

- Seller products is absent from the sidebar.
- Catalogue and Product Studio are visible.
- Product Studio loads for the seller account.
- Console errors: 0.

Mobile, 390x844:

- Admin Product Studio horizontal overflow: none.
- Seller Product Studio horizontal overflow: none.

Screenshots:

- `client-projects/client101/evidence/CHG-076/admin-product-studio-list.png`
- `client-projects/client101/evidence/CHG-076/admin-product-studio-detail.png`
- `client-projects/client101/evidence/CHG-076/admin-variants.png`
- `client-projects/client101/evidence/CHG-076/admin-b2c-pricing.png`
- `client-projects/client101/evidence/CHG-076/admin-b2b-pricing.png`
- `client-projects/client101/evidence/CHG-076/admin-review.png`
- `client-projects/client101/evidence/CHG-076/seller-product-studio-list.png`
- `client-projects/client101/evidence/CHG-076/admin-product-studio-mobile.png`
- `client-projects/client101/evidence/CHG-076/seller-product-studio-mobile.png`

## Residual limitations

- Seller published-product edits are direct and audited; Admin review is
  corrective rather than pre-approval.
- Seller products route may still be reachable by direct URL while hidden from
  navigation.
- B2B price-list consumption by the B2B storefront is implemented and verified
  under CHG-078. See
  `session-note-2026-10-25-b2b-storefront-price-consumption.md`.
- Production remains unauthorized.
