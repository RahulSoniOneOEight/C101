# U-009 follow-up fixes — evidence

**Date:** 2026-10-31
**Branch:** `feat/u009-pincode-delivery`
**Environment:** preview Medusa (`buildkart_u009_preview`), preview Experience API

## 1. Delivery fee is tax-inclusive

- `provider.ts` now returns `is_calculated_price_tax_inclusive: true`.
- Store route check: `calculated_price = { calculated_amount: 49, is_calculated_price_tax_inclusive: true }`.
- Unit spec updated; 5/5 PASS.

## 2. Offer pricing minor-unit boundary

- `lib/offer-pricing.ts`: input/output are **paise**; the DB keeps Medusa **major**
  units (`majorToMinor` on read, `minorToMajor` on write).
- `product-import` now passes `sellingMinor` instead of the major value.
- Existing rows verified: `offer_01M66WZJJ4CGB363B299AADM4X` stored `1499`
  major and the API now returns `149900` minor.
- New product QC: send `149900` → DB `1499` → API `149900` → cart
  `unit_price=149900` (₹1,499). 14/14 checks PASS.

## 3. Store route prices calculated options

- New project route `src/api/store/shipping-options/route.ts` overrides Mercur's
  storefront route and calls `listShippingOptionsForCartWithPricingWorkflow`.
- It groups by seller, filters to sellers in the cart, keeps the storefront
  response shape (`{ shipping_options: { sellerId: [...] } }`) and adds the
  seller/type metadata.
- QC: one seller group, `amount=49` major, tax-inclusive true; the Experience
  API sees `4900` minor.

## 4. B2B UI is read-only delivery

- Both B2B tier selectors replaced with a read-only delivery card
  (`b2b_quote_screens.dart`).
- B2B checkout calls `applyDelivery` instead of `selectDeliveryTier`.
- `flutter analyze` clean; 274/274 non-golden tests pass.

## 5. Seller permission

- `delivery.read` added to `seller_admin`; vendor list endpoint now requires
  `delivery.read` (writes still `delivery.update`).

## 6. Admin UI pass + screenshots

Headless Edge (Playwright) against the preview dashboard (`NODE_ENV=development`
so the session cookie is not `Secure` over HTTP):

| Step | Result |
|---|---|
| Login as `u009-qc@buildkart.test` | 200, dashboard loads |
| Nav “Delivery rates” | present, page renders |
| Seller dropdown | all 6 sellers |
| Create 411001 = ₹35 | row created, `updated_by=admin` |
| Edit 411001 = ₹45 | DB `4500` |
| Bulk import (411002=55, 411003=65, one invalid) | `2 created`, `1 line skipped` |
| Delete 411003 | removed; DB has 411001/411002 only |

Screenshots: `screenshots/admin-delivery-rates/` (7 images).

## 7. Free-shipping promotions

| Code | Cart | Before | After |
|---|---|---|---|
| FREESHIP | B2C, PowerMax, pincode 400001 | shipping ₹49 | `shipping_total=0`, `shipping_discount_total=4900`, delivery line still ₹49 gross, total ₹155,000 |
| TRADEVIP | B2B (`buyer.b2b01`, in “B2B Trade Customers”) | shipping ₹49 | `shipping_total=0`, `shipping_discount_total=4900`, total ₹152,000 |

## 8. Migration up/down

Throwaway clone `buildkart_u009_migtest`:

1. up → `seller_delivery_rate` present.
2. `db:rollback --modules delivery_rates` → reverted `Migration20261030120000`, table **DROPPED**.
3. up again → table present.
4. clone dropped.

## 9. Remaining known limitation

- **SKU reuse after product deletion** is not fixed: the soft-deleted product
  keeps its variant and offer inventory item, so the SKU stays reserved. The
  check was left explicit (`SKU is already in use`) rather than allowing a path
  that fails later at inventory creation.

## 10. Environment notes

- The preview dashboard build uses `MERCUR_BACKEND_URL`. For dashboard QC it was
  rebuilt as `http://127.0.0.1:19010` and exposed through an SSH tunnel.
- `NODE_ENV=development` is required for HTTP dashboard login because the
  production session cookie is `Secure`.
- The release image must be rebuilt from the final commit; the currently
  running preview API contains hot-patched sources from this session.

## 11. Final-image verification (`485be84`)

Rebuilt `buildkart-hosted-pilot-medusa:u009-preview` from the commit and re-ran
the suites against the clean artifact:

| Suite | Result |
|---|---|
| Live calculated-delivery gate | PASS (29/99/99 major) |
| Product creation + pricing | 14/14 PASS (send 149900 → DB 1499 → API 149900 → cart 149900) |
| Store pricing route | 5/5 PASS (one seller, amount 49, tax-inclusive true, Experience 4900) |
| FREESHIP / TRADEVIP | 8/8 PASS (shipping 0, discount 4900, delivery line visible) |
| B2C + B2B order E2E | 22/22 PASS |

Orders from the final run:

- B2C `BK-261031-6QE6A7`, group `og_01M68E4MXHGPXV53YB9ZKKMX39`,
  shipping ₹49, total ₹147,299.
- B2B `BK-261031-170SYT`, group `og_01M68E4VYVXRQQN2ZVQ7Y7HM1Z`,
  shipping ₹49, total ₹144,449.

The screenshots in §6 came from the UI-specific build (same page source,
`MERCUR_BACKEND_URL=http://127.0.0.1:19010`). The final preview image was rebuilt
with the deployment's default backend URL, so the dashboard in that image points
at staging — the release pipeline must pass the correct URL per environment.

