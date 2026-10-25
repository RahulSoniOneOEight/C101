# Product Studio — consolidated page note

Date: 2026-10-25
Status: implemented — staging verification pending
Scope: Admin and Seller product create/edit flow
Production: not authorized

## 1. Purpose

Product Studio is the single create/edit flow for a product listing.

- Catalogue is for finding products.
- Products is the master product list.
- Categories and Collections organise the catalogue.
- Seller-specific offers are viewed inside the product context.
- Product Studio is not a separate catalogue tab; it opens from Products.

## 2. Navigation

Admin:

```text
Catalogue
  ├── Products
  ├── Categories
  └── Collections
```

Seller:

```text
Catalogue
  └── Products   (seller's own listings only)
```

The old **Seller products** tab is removed. Its offer/listing data remains available
through the product and Product Studio context. The old route must redirect to Products.

## 3. Page layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Product Studio                         [Draft]  [Save draft] [Publish]│
├───────────────────────────────────────────────┬──────────────────────┤
│ MAIN FORM                                     │ LIVE SUMMARY         │
│                                               │                      │
│ 1  Product details                            │ [thumbnail]          │
│    title · short/full description             │ Product title        │
│    category · product type                    │ B2C ₹300 / ₹380      │
│    brand · manufacturer · model               │ B2B ₹380 / ₹380      │
│    HSN/GST · unit of measure                  │                      │
│    thumbnail URL + preview                    │ Status: Ready        │
│                                               │ ✓ Details            │
│ 2  Search tags                                │ ✓ Variants           │
│                                               │ ✓ B2C price          │
│ 3  Specifications                             │ ✓ B2B price          │
│                                               │                      │
│ 4  Variants and SKUs                          │ [Publish]            │
│                                               │                      │
│ 5  Seller offer                               │                      │
│                                               │                      │
│ 6  Pricing                                    │                      │
│                                               │                      │
│ 7  Inventory                                  │                      │
│                                               │                      │
│ 8  Review and publish                         │                      │
└───────────────────────────────────────────────┴──────────────────────┘
```

Mobile stacks the summary below the form and keeps the action bar sticky.

## 4. Product details

| Field | Required | Notes |
|---|---|---|
| Product title | Yes | Customer-facing |
| Short description | No | One-line listing summary |
| Full description | No | Product detail copy |
| Category | Yes | Catalogue taxonomy |
| Product type | No | Commercial classification |
| Brand | No | Metadata |
| Manufacturer | No | Legal manufacturer |
| Model / part number | No | Manufacturer reference |
| HSN / GST code | No | Product master; tax/invoice use |
| Unit of measure | No | e.g. piece, metre, box |
| Thumbnail URL | No | Single HTTPS image URL; preview required |

Thumbnail is the only media field in this version. No uploader or gallery.

## 5. Search tags and specifications

Search tags:

- Free text.
- Optional suggestion chips: Best Deal, Flash Deal, Latest Seed Season, Seasonal.
- Suggestions do not auto-apply.
- Show selected count.
- Product Studio is the single owner of search tags; remove duplicate metadata storage.

Specifications:

- Name, value, optional unit.
- Complete when name and value are filled.
- Blank template rows ignored.
- Show `X complete · Y incomplete`.
- Optional for publish.

## 6. Variants and SKUs

No mandatory Color option. No built-in New/Old option.

```text
Product structure
  (•) Single variant
  ( ) Custom options

Single variant
  Variant name*         [ Default ]
  Details shown in app* [ ______________________________ ]
  Variant image         [ https://... ]  [preview]
  SKU*                  [ SKU-001 ]

Custom options
  Option 1
    Option name  [ Material ]
    Values       [ Brass, Stainless Steel ]
  [Add option]  [Generate variants]

Variant table
┌──────────────┬──────────────────┬──────────┬──────────┬────┐
│ Variant name │ Details          │ Image    │ SKU      │ ×  │
├──────────────┼──────────────────┼──────────┼──────────┼────┤
│ Brass        │ Brass body...    │ [URL]    │ BR-001   │ ×  │
│ Steel        │ Steel body...    │ [URL]    │ ST-001   │ ×  │
└──────────────┴──────────────────┴──────────┴──────────┴────┘
```

Rules:

- Variant name required.
- Variant details required; this is shown in the app.
- Variant image optional; may differ per variant.
- Blank variant image falls back to the product thumbnail.
- SKU required.
- EAN, UPC and barcode removed from the Product Studio variant UI.
- Existing barcode data is preserved in storage.
- Options are custom-only.

## 7. Pricing

Pricing is one section with B2C and B2B contexts. There are no separate
`Save B2C price` / `Save B2B price` buttons in the final flow; pricing is included
in `Save draft` and `Publish`.

```text
6  Pricing

[Bulk reference pricing]
  Channel: (•) B2C  ( ) B2B
  List price [ 340 ]   GST [x]
  [Preview changes]
  4 ready · 2 blocked
  [Apply 4 ready]

Per offer/variant:

┌─ B2C pricing ──────────────────────────────┐
│ List price (MRP) [ 380 ]                   │
│ Selling price    [ 300 ]                   │
│ GST-inclusive    [x]                       │
└────────────────────────────────────────────┘

┌─ B2B pricing — B2B Trade Customers ────────┐
│ List price       [ 380 ]                   │
│ Selling price    [ 380 ]                   │
│ MOQ              [ 1 ]                     │
│ GST-inclusive    [x]                       │
│ Effective from   [ date ]                  │
│ Effective to     [ date ]                  │
│                                            │
│ Quantity tiers                             │
│ Min qty | Max qty | Unit price | Remove    │
│ [ 10 ]  | [ 50 ]  | [ ₹299 ]   | ×         │
│ [ 51 ]  | [ 100 ] | [ ₹290 ]   | ×         │
│ [Add tier]                                 │
└────────────────────────────────────────────┘
```

Rules:

- B2C has list price, selling price and GST only.
- B2C has no quantity tiers.
- B2B has list price, selling price, GST, MOQ, tiers and effective dates.
- B2B tiers are structured rows.
- No reason-for-change field.
- Bulk reference pricing is channel-specific, preview-first and applies only valid offers.
- Blocked offers are never silently changed.
- Audit records actor, source, before/after, timestamp and operation ID automatically.

## 8. Review and publish

No separate review page. Review is a compact status check.

```text
8  Review and publish

Status: ● Ready to publish

✓ Product details
✓ Category
✓ Variants and SKUs
✓ B2C pricing
✓ B2B pricing

Optional
○ Thumbnail missing
○ Search tags missing

Channels: [x] B2C   [x] B2B

[Publish]
```

Blockers:

- Product title.
- Category.
- At least one variant.
- Every variant has a name.
- Every variant has details.
- Every variant has a SKU.
- B2C list and selling price, if B2C enabled.
- B2B list and selling price, if B2B enabled.
- B2B MOQ, if B2B enabled.

Optional warnings:

- Thumbnail missing.
- Search tags missing.
- Specifications missing.
- No inventory information.

Statuses:

- Draft
- Needs attention
- Ready to publish
- In review
- Published
- Unpublished changes

Role behaviour:

- Admin: `Publish` / `Publish changes`.
- Seller: `Submit for review` unless auto-publish is allowed.

## 9. Create and edit flow

```text
New product
  → Product Studio
  → details
  → search tags
  → specifications
  → variants
  → seller offer
  → B2C/B2B pricing
  → inventory
  → review
  → publish

Edit draft
  → same Product Studio page
  → prefilled values
  → save draft

Edit published product
  → same Product Studio page
  → prefilled values
  → status: Unpublished changes
  → publish changes / submit for review
```

## 10. State flow

```text
Draft
  ↓
Needs attention
  ↓
Ready to publish
  ↓
In review          (seller, when approval is required)
  ↓
Published
  ↓
Unpublished changes
  ↓
Published
```

## 11. Removed surfaces

- Separate Seller products tab.
- Separate price studio/modal.
- Separate product-images editor.
- B2C quantity tiers.
- EAN/UPC/barcode fields in variants.
- Mandatory Color option.
- New/Old preset option.
- Reason-for-change text boxes.
- Complex review page.

## 12. Acceptance criteria

- Catalogue has Products, Categories and Collections only.
- Product Studio opens from Products for create and edit.
- Seller products tab is removed and its route redirects.
- Product details match the agreed fields.
- Thumbnail is a single URL with preview.
- Search tags and specifications remain optional.
- Variants are custom-only.
- Variant name and details are required.
- Variant image is optional and can differ.
- SKU is required.
- EAN/UPC/barcode are absent from the variant UI.
- B2C has no tiers.
- B2B has MOQ and structured tiers.
- No reason text boxes.
- Review is a status check with a publish action.
- One Save draft and one publish/submit action.
