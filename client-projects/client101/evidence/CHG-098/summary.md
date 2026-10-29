# CHG-098 — B2B canonical checkout and Admin verification

**Status:** STAGING DEPLOYED AND VERIFIED
**Environment:** staging only. Production was not touched.
**Completed:** 2026-10-29

## 1. Release identity

| Item | Value |
|---|---|
| Baseline | `/opt/buildkart-releases/release-6c776fc` (`6c776fc`, CHG-096 v7) |
| API/Admin release branch | `release/chg-098-2` |
| API/Admin release commit | `186a50f8f69c5d9d436ab53c8c7e8dbf1c270f5` |
| API/Admin release path | `/opt/buildkart-releases/release-186a50f` |
| Medusa image | `sha256:d65bb7b46761` |
| Flutter app commit | `8482e94` (same app code; Admin badge is API-only) |
| Rollback release | `release-6c776fc` |
| Rollback image | `buildkart-hosted-pilot-medusa:rollback-6c776fc` |
| Production | Not authorized |

## 2. Root causes fixed

1. **B2B order creation was local-only.** `B2BOrdersNotifier.placeOrder()` built a local
   `B2BOrder` and never called the cart/checkout API.
2. **B2B price-list rule used the wrong Medusa attribute.** Rules were written as
   `customer_group_id`; the deployed Medusa pricing engine expects `customer.groups.id`.
3. **B2B price-list amounts were stored in minor units.** Medusa price lists in this
   deployment use major units, so even a matching list was 100× too high.
4. **The app added GST on top of GST-inclusive trade prices.** The B2B snapshot is
   `gst_inclusive: true`, so the app total and the canonical total disagreed.

## 3. Fixes applied

- Wired B2B `Place Business Order` to `POST /v1/carts` (`channel=b2b_app`), line items,
  customer/shipping details, delivery tier and `POST /v1/checkouts/{id}/complete`.
- Added a price guard: if the canonical subtotal does not match the B2B snapshot subtotal,
  checkout aborts before creating an order.
- Persisted canonical order-group/cart IDs and amounts on the B2B confirmation screen.
- Treat B2B trade prices as GST-inclusive in the app summary.
- Corrected B2B Studio writes to use `customer.groups.id` and major-unit price-list amounts;
  reads convert back to minor units for the Product Studio/admin contract.
- Backfilled existing staging B2B Studio price lists idempotently:
  - 21 old-format rule sets normalized
  - 36 price rows converted from minor to major units
  - all 22 B2B Studio lists marked `b2b_price_units: major`
- Added an explicit **B2B trade order** badge and business-account line to the Admin order
  detail because the shared Medusa sales channel remains `B2C Storefront`.

## 4. B2B order placed

| Field | Value |
|---|---|
| Buyer | `buyer.b2b01@buildkart.test` / Arjun Traders |
| Cart | `cart_01M64BZY6APK55P07T3CA342E1` |
| Order group | `og_01M64C01MVC35YEK45658BERQ2` |
| Order | `#156` / `order_01M64C01MBZC5JFYJJ5TB4X2QH` |
| Line | Wonder Cement / `WON-PPC-DAN-01` / qty 1 |
| B2B unit price | **₹350.00** (compare-at ₹400.00) |
| Discount | FLAT5 **−₹17.50** |
| Shipping | ₹99.00 |
| Total | **₹431.50** |
| Payment | Simulated, authorized, test data |
| Channel metadata | `channel=b2b`, `business_account_id=business_arjun_traders` |
| Delivery site | Site A — Main block (Pune) |
| Admin visibility | Order #156 renders with B2B badge, business account, authorized ₹431.50 |

## 5. Verification

| Check | Result |
|---|---|
| Flutter analyze (changed files + test) | pass |
| B2B test suite | pass — 72 tests |
| API TypeScript build | pass |
| Admin TypeScript/lint | pass |
| Public health (api/ops/admin/seller) | 200 / 200 / 200 / 200 |
| Flutter web deploy | 200 |
| B2B UI order placement | 10/11 immediate checks |
| B2B Admin QC | 6/6 PASS |

**UI timing note:** the UI script's `delivery site selected` check read the checkout buffer
before the saved-site bottom sheet had closed. The confirmation screen and canonical
address both show **Site A — Main block (Pune)**. This is a QC timing artifact, not a
failed site selection.

## 6. Data written

- One staging B2B order group and order (`#156`), retained as test data.
- One simulated payment session, authorized but not captured.
- Existing B2B Studio price-list rules/amounts corrected in place.
- No Tryton stock move, carrier event, real PSP charge or production change.

## 7. Evidence

- `b2b-order-ui-qc.mjs`, `b2b-order-ui.json`
- `b2b-admin-qc.mjs`, `b2b-admin-qc.json`
- `b2b-order-readback.json`
- `b2b-price-lists-before.json`, `b2b-price-lists-after.json`
- `backfill-b2b-price-lists.sql`
- `b2b-cart.png`, `b2b-checkout.png`, `b2b-order-confirmed.png`, `b2b-admin-order.png`
