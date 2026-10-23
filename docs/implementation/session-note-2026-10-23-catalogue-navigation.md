# Catalogue navigation — Product Studio and Seller products

Date: 2026-10-23
Lane: A — UI/navigation only
Release: `9cceaae`
Environment: staging only

## Outcome

- `Product Studio` is now a child item under `Catalogue` in both Admin and Seller.
- The native `Offers` child item is relabelled `Seller products` in both portals.
- The `Offers` page title and breadcrumb resolve to `Seller products` through the host i18n
  resource.
- Existing routes are unchanged:
  - Admin Product Studio: `/dashboard/product-studio`
  - Seller Product Studio: `/seller/product-studio`
  - Admin Seller products: `/dashboard/offers`
  - Seller Seller products: `/seller/offers`

This keeps bookmarks and deep links working while making the catalogue hierarchy explicit.

## Delivered

- `services/backend/apps/admin/src/routes/product-studio/page.tsx`
  - Label: `Product Studio`
  - `nested: "/products"`
- `services/backend/apps/vendor/src/routes/product-studio/page.tsx`
  - Label: `Product Studio`
  - `nested: "/products"`
- `services/backend/apps/admin/src/_navigation.ts`
  - `offers` label: `Seller products`
- `services/backend/apps/vendor/src/_navigation.ts`
  - `offers` label: `Seller products`
- `services/backend/apps/admin/src/i18n/en.json`
  - `offers.domain`: `Seller products`
- `services/backend/apps/vendor/src/i18n/en.json`
  - `offers.domain`: `Seller products`

## Resulting navigation

Admin and Seller:

```text
Catalogue
  Seller products
  Collections
  Categories
  Product Studio
```

## Verification

Builds:

- Admin production build: pass.
- Seller production build: pass.
- `tsc` navigation ids validated through the generated extension targets.
- No schema, API, pricing or inventory change.

Hosted staging (`9cceaae`):

- Admin nav shows `Catalogue > Seller products, Collections, Categories, Product Studio`.
- Seller nav shows the same hierarchy.
- Admin `/dashboard/offers` page title: `Seller products`.
- Seller `/seller/offers` page title: `Seller products`.
- Admin and Seller Product Studio return HTTP 200.
- Admin console errors: 0.
- Seller console errors: 0.
- Product Studio remains the primary product/pricing edit surface.
- Seller products remains a seller-scoped listing view.

Screenshots:

- `client-projects/client101/evidence/CHG-074/catalogue-nav-admin.png`
- `client-projects/client101/evidence/CHG-074/catalogue-nav-seller.png`
- `client-projects/client101/evidence/CHG-074/seller-products-admin.png`
- `client-projects/client101/evidence/CHG-074/seller-products-seller.png`

## Residual notes

- `Product Studio` is grouped under `Catalogue`; it is not a separate top-level sidebar item.
- The paths remain `/product-studio` and `/offers`; this is intentional to avoid breaking links.
- The native offer-detail `Seller pricing` widget remains. Product Studio remains the broader
  B2C/B2B editor.
- Navigation-only rename; direct-route access and RBAC are unchanged.
- Production remains unauthorized.

## Staging

- Release: `/opt/buildkart-releases/release-9cceaae`
- Admin: `https://ops-staging.pinakaplay.cloud/dashboard/`
- Seller: `https://ops-staging.pinakaplay.cloud/seller/`
