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

## Residual observations

- The seller review screen correctly reports “Published · Not live” and the exact missing gates.
- Product images and search tags remain optional warnings, not blockers.
- The native Mercur mobile order row still crowds the reservation badge (separate upstream layout
  issue).
- The earlier seller channel-label UI bundle remains on its own branch, unaffected by this release.
