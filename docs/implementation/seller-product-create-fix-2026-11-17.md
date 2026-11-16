# Seller product creation — staging QC, defect fix and deployment

**Date:** 2026-11-17  
**Lane:** B (vendor UI + Mercur API, no schema, no migration)  
**Status:** deployed to staging and verified; production untouched.

## QC result

The first live QC used the seller portal (`/seller/products/new`) as **BuildKart Direct** with a
clearly marked test product (`QC Add Flow 20261117-0004`, SKU `QC-ADD-20261117-0004`). The form
accepted title, category (`Hand Tools`), variant name, SKU and description, then **Create product**
returned HTTP **422**:

> A reason is required before provisioning seller offers.

No product, offer, inventory item, price or order was created; validation fails before any write.
The error was visible but not announced (`role="alert"` was missing).

## Cause

`saveStudioProduct` computed `requestedSellerId` as the acting seller for **both** admin and vendor
mode, then required `seller_provision_reason` whenever it was set. The vendor form only collects a
reason in admin mode, so every seller-owned create and edit failed. The reason exists to justify an
**admin** assigning a product to a seller; a seller saving their own product provisions their own
offer implicitly.

## Fix

- `product-studio-guard.ts` requires the reason only when `mode === "admin"` and a seller is
  selected.
- Vendor variant row shows **“Your seller account”** instead of a false **“⛔ Missing”** before the
  first save.
- Save errors carry `role="alert"` so a blocked seller is notified.

## Verification

| Check | Result |
|---|---|
| Jest unit test (`product-studio-guard.unit.spec.ts`) | 3 passed |
| `tsc --noEmit` (packages/api) | passed |
| Vendor production build (staging config, `/seller/` base) | passed |
| ESLint on `studio-form.tsx` | pre-existing React-hooks errors only; no new finding |
| Live create after deploy | HTTP **201** — product `prod_01M7JW4PVYF7C8WW0D024RVHPF` |
| Seller offer | `offer_01M7JW4QKP33N06VNDWJBY6TFZ`, BuildKart Direct |
| Inventory link and level | `iitem_01M7JW4QE9BNQ5CW8S2512YC6G`, 50 stocked / 0 reserved |
| Price after create | 0 prices (expected; no customer visibility) |
| Unpriced review gates | B2C and B2B **Not live** — Published ✓, Offer ✓, Price ✕, Stock ✕ |
| B2C pricing save | HTTP **200** — ₹120 list / ₹100 selling |
| Priced review gates | B2C **Live** — Published ✓, Offer ✓, Price ✓, Stock ✓, 0 blockers |
| Cleanup | Offer, inventory item and product deleted; product 404, 0 offers, item 404 |

The unpriced review showed **Stock ✕**; after a B2C price was saved, the same product showed
**B2C Live** with **Stock ✓**. The storefront therefore treats Mercur stock (50 units) as available
even though the offer has `manage_inventory=false` and Tryton holds no reservation. This is the same
Mercur/Tryton separation reported for order #196, not a regression from the add-flow fix.

## Deployment

The live staging release was `release-u014-9a3592aea` (commit `9a3592aea`, 2026-11-01), a descendant
of the original CHG-094 base. The fix was rebased onto that exact commit, re-tested, and deployed as
a new immutable release:

- Branch: `fix/seller-product-create`
- Fix commit: `88da982` (rebased onto `9a3592aea`)
- Release: `/opt/buildkart-releases/release-u014-fix-88da982`
- Services rebuilt: `medusa-api`, `medusa-worker`, `experience-api`, `event-workers`
- Proxy restarted; `api-staging` and `ops-staging` health returned 200; dashboard and seller
  surfaces returned 200.

The bulk-import seller-assignment fix followed in a second immutable release:

- Import fix commit: `981b642`
- Release: `/opt/buildkart-releases/release-u014-fix-981b642`
- Services rebuilt: `medusa-api`, `medusa-worker`; proxy restarted; admin and seller healthy.

The B2B pre-validation fix followed in a third release:

- B2B fix commit: `674d782`
- Release: `/opt/buildkart-releases/release-u014-fix-674d782`
- Services rebuilt: `medusa-api`, `medusa-worker`; proxy restarted; services healthy.

The documented deploy key was restored to `C:\Users\LENOVO\.ssh\buildkart_deploy` from the private
local context file; the key itself is never committed or copied into this repository.

## Bulk import QC

The admin import at `/dashboard/products/import` was tested with a three-row CSV:

- one valid row (B2C + B2B, tiers, stock override, both channels);
- one row with an unknown category;
- one row with an existing catalogue SKU.

**Validate** returned `1 ready / 2 failed` with precise messages. **Apply** returned `1 created / 2
failed`; the failures were skipped, and the created row produced
`prod_01M7JWR4WTD3KMBW7A0D159K1G` (removed after QC). The UI showed the result table, an
“Open product” link and an error-download action with no page errors.

Verified on the created row: published, B2C and B2B channels, B2C ₹120 selling / ₹150 list, B2B
₹110 with MOQ 5 and tiers 10→₹105 / 20→₹100, and stock 7 at the seller warehouse.

**Defect found:** the assigned seller could not see or edit the imported product. The vendor studio
returned 404 because ownership comes from the `product_seller` link (or a seller-created change
action), and the import passed no product-level seller. The importer therefore reported success for
a product that the seller could not manage.

Fix applied and deployed: each imported row now sets `seller_id` and a truthful
`seller_provision_reason` (`CSV import (<sku>)`), which creates the product–seller link and satisfies
the admin provisioning audit.

**Re-QC after deploy (`981b642`):** the mixed CSV again produced `1 created / 2 failed`. The seller
studio read returned **200** with `owned: true`, the product appeared in seller search and the vendor
product list, and the seller review page showed **B2C and B2B Live** with 0 blockers (one missing-image
warning). The imported product (`prod_01M7JXCFQPDJVVTQKCSVBB3H3V`), its offer and inventory item were
then deleted; product 404, 0 offers.

## Residual observations

- A priced studio product showed **B2C Live** with 50 Mercur units while `manage_inventory=false`
  and no Tryton reservation. The bulk-imported product behaved the same way and was **Live on both
  B2C and B2B** with 7 Mercur units. Pricing can therefore make a studio product storefront-live on
  Mercur stock; this is the same Mercur/Tryton separation reported for order #196 and needs a policy
  decision, not a display fix.
- B2B tier and price fields are now validated **before any write** (`product-import-b2b.ts`), so an
  invalid tier fails both validate and apply without creating a product. Unit tests cover selling
  above list, tier above selling, tier below MOQ, overlapping/malformed tiers and invalid money.
- **Live proof after deploy (`674d782`):** a direct `mode=apply` of a row with B2B selling ₹100 and
  tier `10:150` returned `created: 0 / failed: 1` with “A higher quantity cannot produce a higher
  unit price.”, and the catalogue held **0 products and 0 offers** for that SKU. A valid row in the
  same call shape created normally (both channels, stock 3, B2B ₹110 with MOQ 5 and tiers
  10→₹105 / 20→₹100), then was deleted; product 404, 0 offers.
- Product images and search tags remain optional warnings, not blockers.
- The native Mercur mobile order row still crowds the reservation badge (separate upstream layout
  issue).
- The earlier seller channel-label UI bundle remains on its own branch, unaffected by this release.
