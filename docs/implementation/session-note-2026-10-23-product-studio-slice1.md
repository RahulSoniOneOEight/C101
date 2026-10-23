# Product studio Slice 1 — staging delivery note

Date: 2026-10-23  
Lane: C (shared Admin/Seller product editor, additive API facade)  
Release: `7334e92`  
Status: staging verified; production unauthorized

## Delivered

- New shared route `/product-studio` in the Mercur admin panel and vendor
  (seller) panel.
- Create and edit a product master draft with:
  - title, short description, full description
  - category, product type, brand, manufacturer, model/part number
  - HSN/GST and unit of measure
  - thumbnail URL
  - search-tag chips
  - structured specifications (name, value, optional unit)
- Catalogue search before create, with links to the native record and, where
  permitted, the studio editor.
- Browser-local draft recovery, explicit save, customer preview and readiness
  checks.
- Seller ownership guard: a seller can only open and edit its own draft.
- Admin can edit any product draft.
- Shared tag creation and product save facade:
  - `/admin/buildkart/product-studio`
  - `/vendor/buildkart/product-studio`
- Confirmed Mercur ProductChange `UPDATE` audit on every editor save, with
  actor, role, before/after title and metadata, tag ids and specification count.
  Creation already records `PRODUCT_ADD`.

## Canonical ownership

| Data | Owner | Storage |
|---|---|---|
| Product master | Medusa | `product` |
| Search tags | Medusa | `product_tag` / `product_tags` |
| Studio specifications | Mercur product attributes | product-scoped `product_attribute` / values |
| Product type, HSN/GST and UOM | Medusa product metadata until mapping approved | `product.metadata` + native `hs_code` |
| Seller ownership | Mercur | `product_seller` / ProductChange author |

Studio specifications carry `metadata.buildkart_studio = true` and
`metadata.studio_order`. Existing catalogue attributes are not removed.

## Verification evidence

- Admin API create: draft with 2 tags, 4 specifications.
- Admin API edit: title, tags and specifications changed; earlier studio
  specifications removed and replaced; imported catalogue attributes preserved.
- Admin UI create: 3/3 sections ready; navigated to edit page.
- Seller UI create: draft linked to `sel_01M4EC9C7YNSFGCG6A4B3Q6PG8`
  (`BuildMaster Supplies`).
- Admin and seller screenshots inspected; catalogue thumbnails constrained and
  the customer-preview rail sits beside the form on desktop.
- Temporary QC products and tags removed after verification.
- Staging container healthy after deployment; admin and seller panels served.

## Safety boundaries

- `production_release_authorized: false`.
- No Medusa schema migration was required.
- No pricing, inventory, variant or publication write was introduced.
- Seller edits are draft-only in this slice. Published product changes and
  seller submission move through ProductChange in Slice 5.
- No Tryton stock effect and no payment effect from this increment.

## Open items

1. Slice 2 variant/SKU builder and SKU uniqueness.
2. Slice 3 embed existing audited offer pricing.
3. Slice 4 Tryton-backed inventory read/adjustment.
4. Slice 5 ProductChange submission, review and publish.
5. Approve native product-type mapping, GST/UOM mapping and technical-document
   storage.
6. Add duplicate-catalogue blocking and “sell existing product” offer creation.
