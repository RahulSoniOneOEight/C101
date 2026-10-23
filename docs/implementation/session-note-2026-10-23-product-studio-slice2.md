# Product studio Slice 2 — variant and SKU delivery note

Date: 2026-10-23  
Lane: C (shared Admin/Seller product editor, additive product-option/variant orchestration)  
Release: `e554634`  
Status: staging verified; production unauthorized

## Delivered

- Option axes inside the shared studio page:
  - up to three options per draft
  - ordered option values
  - combination generation up to 100 variants
- Variant rows with:
  - title
  - SKU
  - EAN
  - UPC
  - barcode
  - remove action
- Bulk SKU prefix that fills only blank SKUs.
- Client and server duplicate checks for SKUs and combinations.
- Default-only drafts with one `Default` variant.
- Ordered option and variant rendering.
- Existing imported catalogue variants can have SKU/EAN/UPC/barcode edited;
  their option axes are read-only in this slice.
- Studio-managed draft option changes replace options and variants, then append
  a confirmed ProductChange `UPDATE` audit.

## Canonical ownership

| Data | Owner |
|---|---|
| Option axes and values | Medusa product options |
| Variant identity, SKU, EAN/UPC/barcode | Medusa product variants |
| Seller ownership | Mercur product-seller link |
| Draft audit | Mercur ProductChange (`UPDATE`) |

Options are created as Medusa exclusive options, linked to the product, then
variants are created against them. Existing imported catalogue option axes are
not mutated by the studio.

## Verification evidence

- API create with `Size × Colour`: 2 options and 4 variants in input order.
- API edit with unchanged axes: SKU changed and one variant removed.
- API edit adding an option value: options regenerated, 6 variants created.
- Default-only create and SKU edit: passed.
- Duplicate SKU create: rejected with `422`.
- Admin UI create: 4 variants, 4 SKU fields, bulk SKU fill passed.
- Seller UI create: seller-owned draft with 2 variants and SKUs.
- Admin and seller screenshots inspected after inline layout fix.
- Temporary QC products, orphan options and tags removed after verification.

## Safety boundaries

- `production_release_authorized: false`.
- Draft-only variant editing for sellers.
- Published imported catalogue variants remain read-only.
- Variant inventory stays `manage_inventory: false`; no Tryton stock effect.
- No payment, offer, price or publication effect.
- Recreating variant IDs is limited to studio-managed drafts and is not safe
  for live offers without a migration plan.
- Max 3 options and 100 combinations in this slice.
- Removing all options from an existing optioned draft is blocked; create a new
  default-only draft.

## Open items

1. Slice 3: embed audited offer pricing in the studio.
2. Slice 4: Tryton-backed inventory read/adjustment.
3. Slice 5: ProductChange submission, review and publish.
4. Decide whether imported catalogue variant axes can be edited safely under
   offer and inventory constraints.
5. Add variant image assignment and per-variant media when media storage is
   governed.
6. Add barcode/EAN format validation against the final GTIN policy.
