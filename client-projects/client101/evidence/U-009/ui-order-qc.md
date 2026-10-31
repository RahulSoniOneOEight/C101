# U-009 / B004 — End-to-end UI order QC on staging

**Date:** 2026-10-31
**Target:** staging only (`https://buildkart-staging.web.app`, `https://api-staging.pinakaplay.cloud`)
**Web build:** `main.dart.js` 3,923,009 bytes @ 2026-10-31 15:08 local, deployed to Firebase
`buildkart-staging`; contains `Include the 6-digit PIN code` and `has no 6-digit PIN code`.
**Verdict:** PASS with one defect found and fixed during QC (B2B pincode); two UX residuals.

## 1. What was exercised

Real browser (Playwright + Edge), semantic tree of the Flutter web app. No API shortcuts for
the order path — every order below was placed through the storefront UI.

| Step | B2C | B2B |
|---|---|---|
| OTP sign-in (`rsoni001@gmail.com` / `buyer.b2b01@buildkart.test`) | PASS | PASS |
| Search → product → add to cart | PASS (`iPhone14`, PowerMax, ₹130,000) | PASS (`Wonder Cement`, PowerMax, ₹350) |
| Cart delivery card | PASS | n/a — quotation cart has no delivery line |
| "Check delivery fee" | PASS | n/a |
| Checkout delivery card (read-only) | PASS | PASS (rule text, no amount) |
| Change/add address or site | PASS | PASS |
| Fee re-resolves on address change | PASS | PASS (after fix) |
| Place order | PASS | PASS |
| Confirmation screen | PASS | PASS |
| Order list + order detail | PASS | PASS |
| Admin order view | PASS | PASS |
| Vendor order view | PASS | n/a |

## 2. B2C flow (order #166)

Address `301019` (Bhiwadi, default) → PowerMax ₹99 → changed to a new Mumbai address `400001`
→ **PowerMax ₹49**. Placed → `BK-261031-M7763P`.

Order detail (customer): Items ₹130000 · **Shipping ₹49** · Discount −₹6500 · Total **₹123549**.
Admin #166: Shipping Subtotal **₹49.00**, Total After Discount ₹123,549.00.
Vendor #166 (PowerMax): Shipping Total **₹49.00**, Order Total ₹123,549.00.

DB: `order_shipping_method` amount `49`, `is_tax_inclusive = t`;
`order_summary.current_order_total = 123549`.

Screenshots: `40-cart.png`, `41-cart-address.png`, `43-checkout.png`, `55-checkout-400001.png`,
`56-order-placed.png`, `57-orders-list.png`, `58-order-detail.png`, `60-admin-order-166.png`,
`61-vendor-order-166.png` (all under `screenshots/staging-ui/`).

## 3. Defect found — B2B delivery fee ignored the selected site

**Symptom.** First B2B order (#167, `og_01M68MRN0R5H6C49XEA9HMX0N4`) shipped to
`12 Test Lane, Andheri East, Mumbai, Maharashtra 400001` but was charged **₹99** — the fallback —
instead of the PowerMax ₹49 rate. DB showed the stored address as `postal_code 302001 / Jaipur`.

**Root cause.** `_b2bCheckoutAddress` in `apps/prototype_app/lib/providers/b2b_trade_providers.dart`
hardcoded `postalCode: '302001'`, `city: 'Jaipur'`, `province: 'Rajasthan'` and pushed the selected
site label into `address_2`. Saved sites carried no pincode at all (`SiteOption` had only name + city),
so no B2B order could ever hit a `(seller, pincode)` rate.

**Fix (commit `f6a86ab`).**
- `SiteOption` now carries `province` + `pincode` and owns the canonical location string
  (`name, city, province pincode`); the four saved-site seeds now have real PIN codes
  (Pune 411001 / 411014, Mumbai 400001).
- `_b2bCheckoutAddress` extracts the 6-digit PIN, drops it before splitting so it never becomes a
  city, derives city/state (state from the site text, else an Indian PIN-prefix map), and throws a
  clear error when a site has no PIN instead of silently pricing 302001.
- The address is resolved **before** the cart is created, so a bad site fails without an orphan cart.
- The "new delivery site" form now requires a 6-digit PIN.
- `b2b_quick_order_test.dart` updated for the new canonical site string.

**Re-verified after the fix** (new web bundle deployed):

| Order | Path | Stored address | Shipping | Total |
|---|---|---|---|---|
| #167 (before) | new site | 302001 Jaipur | ₹99 | ₹432 |
| #168 | new site `12 Test Lane, … Mumbai 400001` | 400001 Mumbai / Maharashtra | **₹49** | ₹382 |
| #169 | saved site “Project office” | 400001 Mumbai / Maharashtra | **₹49** | ₹382 |

Admin #169 shows Shipping Subtotal ₹49.00, Order Total ₹399.00, Discount ₹17.50,
Total After Discount ₹381.50, and the B2B trade badge.

Screenshots: `70-b2b-login.png`, `71-b2b-home.png`, `72-b2b-pdp.png`, `73-b2b-cart.png`,
`74-b2b-checkout.png`, `75-b2b-site-form.png`, `76-b2b-checkout-site.png`, `77-b2b-order-placed.png`,
`79-b2b-saved-site-confirm.png`, `80-admin-order-169.png`.

## 4. Regression status

- `flutter analyze` — clean.
- `flutter test` — 287 pass, 1 fail: `visual_golden_test: b2b checkout` (23.01% drift).
  Re-ran with the fix stashed: **also 23.01%** — the golden predates the U-009 read-only B2B
  delivery card and is unrelated to this change. Baseline needs a human-approved refresh.
- `b2b_quick_order_test.dart` — 28/28 pass.

## 5. Residuals (not fixed)

1. **B2B shows no fee before placement.** The quotation cart is local-only; the server cart is
   created inside `placeOrder`. Checkout shows “One flat fee per seller, resolved from the delivery
   pincode” and “Shipping and the final total are calculated at order placement.” The amount appears
   only on the confirmation screen. B2C shows it in cart and checkout.
   *Recommendation:* create the server cart on site selection, call `/delivery`, and render the
   amount read-only before enabling “Place Business Order”.
2. **B2B discount rounding.** Line shows `-₹18` (true 17.50) and Total `₹382` (true 381.50).
   B2C rounds correctly. Display-only; underlying order is 381.50.
3. **B2B order origin label.** Admin #169 carries the “B2B trade order” badge but the origin line
   reads “from B2C Storefront”. Pre-existing label bug, unrelated to U-009.
4. **Confirmation screen omits the order number** (B2C shows only “Order placed successfully”);
   the buyer must open My Orders. Minor.
5. B2B checkout still has no address block — only the site label — so admin relies on
   `address_1/2` + city/state from the parsed site text.
