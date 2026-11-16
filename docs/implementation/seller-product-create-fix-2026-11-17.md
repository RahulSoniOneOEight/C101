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
| Storefront gates | B2C and B2B **Not live** — Published ✓, Offer ✓, Price ✕, Stock ✕ |
| Cleanup | Offer, inventory item and product deleted; product 404, 0 offers, item 404 |

The post-create **Stock ✕** gate is expected under the current Product Studio policy: offers are
created with Mercur `manage_inventory=false` and Tryton remains the stock authority. This is the
same Mercur/Tryton separation reported for order #196, not a regression from this fix.

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

Fix applied in source: each imported row now sets `seller_id` and a truthful
`seller_provision_reason` (`CSV import (<sku>)`), which creates the product–seller link and satisfies
the admin provisioning audit. Source typecheck passed; not deployed yet.

## Residual observations

- A priced studio product showed **B2C Live** with 50 Mercur units while `manage_inventory=false`
  and no Tryton reservation. Pricing can therefore make a studio product storefront-live on Mercur
  stock; this is the same Mercur/Tryton separation reported for order #196 and needs a policy
  decision, not a display fix.
- Open risk: invalid B2B tiers are detected after product creation; `saveB2bPricing` then throws, so
  the row can report failed while a product remains. This was not live-tested but is visible in the
  route flow; pre-validating B2B tiers or adding compensation is recommended before relying on
  import for bulk onboarding.
- Product images and search tags remain optional warnings, not blockers.
- The native Mercur mobile order row still crowds the reservation badge (separate upstream layout
  issue).
- The earlier seller channel-label UI bundle remains on its own branch, unaffected by this release.
