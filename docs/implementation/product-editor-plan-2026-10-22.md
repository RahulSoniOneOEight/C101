# Product editor assessment and implementation plan

Date: 2026-10-22  
Status: Slices 1 and 2 implemented in staging; Slice 3 next  
Scope: Admin and Seller product creation/edit  
Related: CHG-074 approved operating defaults

## Slice 1 delivery (2026-10-23)

Slice 1 is live on staging at `/dashboard/product-studio` and
`/seller/product-studio`.

Implemented:

- Shared Admin/Seller create and edit page with the same seven-section shell.
- Product details: title, short/full description, category, product type,
  brand, manufacturer, model/part number, HSN/GST, unit of measure, thumbnail.
- Existing-catalogue search with direct links to the native product record.
- Tag chip editor with suggestions, comma paste and case-insensitive dedupe.
- Structured specification rows with name, value and optional unit.
- Draft create and edit for the product master record.
- Local autosave recovery in the browser plus explicit server save.
- Customer preview and readiness checks.
- Seller-scoped create and edit; sellers can only edit their own drafts.
- Admin and seller tag creation through one audited facade per surface.
- Product-scoped specification attributes flagged with
  `metadata.buildkart_studio = true`; existing catalogue attributes are never
  removed by the editor.
- `studio_order` metadata keeps specification order stable across saves.
- Every product-studio draft save appends a confirmed ProductChange `UPDATE`
  audit record with actor, role, before/after title and metadata, tag ids and
  specification count. Product creation already records `PRODUCT_ADD`.

Verification on staging:

- Admin API create returned a draft with two tags and four specifications.
- Admin API edit changed the title, tags and specifications without deleting
  the imported catalogue attribute.
- Admin UI create navigated to the edit page with 3/3 sections ready.
- Seller UI create produced a draft linked to `BuildMaster Supplies`.
- Admin and seller screenshots passed visual QC.
- Temporary QC products and tags were deleted after verification.

Deliberate Slice 1 boundaries:

- Variants, SKUs, pricing, inventory and publish are visible as next slices,
  not as inactive fake controls.
- Seller draft edits write directly to the draft. Published product changes and
  seller submission will move through ProductChange in Slice 5.
- Product type is stored in product metadata until the native product-type
  mapping is approved.
- HSN/GST and unit of measure are stored on product metadata plus native
  `hs_code`; the tax/UOM mapping remains open.
- Technical-document storage remains out of scope until the document-storage
  decision is approved.
- Catalogue search informs the operator; it does not yet block duplicate
  creation or create a seller offer against an existing master product.
- Save and continue is not implemented yet; save draft returns the operator to
  the same editor.

## Immediate cleanup completed

The incorrect global product attribute was found and removed:

| Field | Value |
|---|---|
| Name | `Coppe Cable` |
| Handle | `3Core` |
| Type | `unit` |
| Scope | Global (`product_id = null`) |
| Required | true |
| Filterable | true |
| Values | one unused value (`4`) |
| Product links | 0 |
| Category links | 0 |
| Option links | 0 |

The attribute and its value were deleted from staging. No product values needed
migration because no product links existed. The field will no longer appear in
product create/edit selectors.

The correct representation is:

- Product type: `Copper Cable`
- Material: `Copper`
- Conductor size: `2.5 sq mm`
- Cable length: `90 metre`
- Number of cores: `3`
- Rated voltage: `... V`

These must be structured specifications, not a numeric field called
`Coppe Cable`.

## Slice 2 delivery (2026-10-23)

Slice 2 is live on staging in the same Admin/Seller studio page.

Implemented:

- Up to three variant options per draft, each with ordered values.
- Combination generator with a 100-combination limit.
- Per-variant title, SKU, EAN, UPC and barcode.
- Bulk SKU prefix that fills only blank SKUs.
- Duplicate SKU and duplicate combination blocking in the UI and API.
- Default-only draft support: no options produces one `Default` variant.
- Native Medusa exclusive product options and variants for studio-managed
  drafts.
- Option labels and variant rows retain the operator's entry order.
- Option-axis edits on a studio draft replace variants atomically through the
  studio save, then record a confirmed ProductChange audit.
- Imported catalogue option axes are read-only in this slice; their existing
  variant SKU/EAN/UPC/barcode fields remain editable.
- Removing all options from an existing optioned draft is blocked in favor of
  creating a new default-only draft.

Verification on staging:

- API create with `Size × Colour` produced two ordered options and four
  variants in the expected order.
- API edit with unchanged axes updated SKUs and removed a variant without
  changing option axes.
- API edit that added a value regenerated the options and six variants.
- Default-only create and SKU edit passed.
- Duplicate SKU create was rejected with `422`.
- Admin UI create with two options produced four variants and four SKU fields.
- Seller UI create produced a seller-owned draft with two variants and SKUs.
- Admin and seller visual QC passed after option/spec rows were made inline.
- Temporary QC products, orphan test options and tags were removed.

Deliberate Slice 2 boundaries:

- Seller/admin variant edits apply to draft products only.
- Published imported catalogue variants remain read-only in this slice.
- Options use native Medusa product options; Mercur axis attributes are not
  introduced for new studio drafts.
- Variant inventory remains `manage_inventory: false`; Tryton and stock levels
  are Slice 4.
- Option changes recreate variant IDs on a draft. This is bounded to drafts and
  must not be extended to live offers without a migration plan.
- No offers, pricing, stock or publication effects are introduced.

## Current product flow

### Admin

- Native Mercur `/dashboard/products`
- Native product create/edit via the ProductChange workflow
- Native offers, inventory, price lists and orders
- BuildKart Seller pricing widget added on offer detail
- No unified seven-section product editor
- No chip tag editor
- No custom specification editor
- No variant combination generator
- No progress/review surface across product, offer, pricing and inventory

### Seller

- Native `/seller/products`
- Product create request through ProductChange
- Native offer create/edit and inventory
- BuildKart Seller pricing widget added on offer detail
- Same gaps as admin, with seller-scoped permissions

## Canonical ownership

| Concern | Owner | Editor surface |
|---|---|---|
| Master product title, description, media, brand, category, type | Medusa | Product details |
| Search tags and synonyms | Medusa `product_tag` | Search tags |
| Structured specifications | Mercur `product_attribute` / values | Product specifications |
| Variants and SKUs | Medusa product options/variants | Variants and SKUs |
| Seller listing and offer | Mercur offer | Variants/pricing bridge |
| B2C/B2B prices and tiers | Medusa pricing, offer-scoped rules | Pricing |
| Inventory truth | Tryton | Inventory read/adjustment request |
| Approval workflow | Mercur ProductChange | Review and publish |
| Search index | Meilisearch projection | Derived only |

The editor must not create a second product, attribute, price or inventory model.

## Proposed implementation sequence

### Slice 1 — Product details + tags + specifications + draft

- One continuous product page with progress rail.
- Product details: name, short/full description, brand, category,
  subcategory, product type, manufacturer, model/part number, HSN/GST,
  unit of measure, media, technical documents.
- Existing-catalogue search before create.
- Tag chip editor with comma paste, suggestions, reuse, duplicate/spelling
  warnings, alternate names/synonyms.
- Specification selector driven by category, optional by default.
- Custom specification with name, value, unit; duplicate/similar warnings.
- Save draft / save and continue / skip.
- Reuse ProductChange draft and existing product attributes/tags.

### Slice 2 — Variants and SKUs

- Option builder and combination generator.
- Remove invalid combinations.
- Bulk SKU/barcode assignment.
- Default variant when no options.
- Duplicate SKU/combination blocking.

### Slice 3 — Pricing inside the editor

- Embed current seller pricing editor.
- B2C/B2B list and selling prices.
- MOQ, quantity tiers, GST-inclusive flag, effective dates.
- Discount calculation and policy-hold warnings.
- Activation blocked without valid pricing.

### Slice 4 — Inventory inside the editor

- Location selector.
- On-hand, reserved, committed, ATP read-only from Tryton.
- Opening inventory and adjustment requests.
- Low-stock threshold and non-stock policy.
- No direct writes to reserved or committed quantities.

### Slice 5 — Review, publish and permissions

- Completion progress, missing information, warnings and review status.
- Preview before submission.
- Submit for review / activate.
- Admin-only approval, standardization, policy override and acting-for reason.
- Audit record for every consequential action.
- Statuses: Draft, Incomplete, Review required, Active, Paused, Rejected, Archived.

## Key gaps / decisions

1. **ProductChange capacity:** confirm whether the current workflow can persist
   all product-detail fields and draft revisions without a new editor schema.
2. **Custom specifications:** confirm whether `product_attribute` supports
   product-scoped custom attributes without polluting the global registry.
3. **Tax/HSN:** Medusa has `hs_code` on product/variant, but GST classification
   and unit of measure need an approved mapping.
4. **Technical documents:** media/file storage policy is not defined.
5. **Tryton adjustment:** seller-facing adjustment request endpoint does not
   exist yet.
6. **Variant combination limit:** set a maximum to protect UI and workflows.
7. **Admin/seller parity:** reuse the same components and APIs; differences are
   permissions and acting-for audit only.

## Acceptance baseline for slice 1

- Seller and admin can open the same product editor layout.
- Product name alone can be saved as draft.
- Tags can be skipped; specs can be skipped; custom specs can be saved.
- Existing catalogue search prevents duplicate master products.
- Save and continue preserves all entered sections.
- No Copper Cable numeric field appears.
- Draft survives navigation and reload.
- Admin can review a seller-created master product; seller cannot approve.
- Every write is scoped and audited.

## Staging state

- Copper Cable attribute cleanup: complete.
- Product editor Slice 1: live on staging.
- Product editor Slice 2: live on staging.
- Product editor Slice 3 (pricing): next.
- Production remains unauthorized.
