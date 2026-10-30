# U-009 / B004 — Closeout

**Date:** 2026-10-30
**Branch:** `feat/u009-pincode-delivery`
**HEAD:** `a3b3173`
**Base / rollback:** `186a50f`
**Preview image:** `buildkart-hosted-pilot-medusa:u009-preview` (from `51c82a3`; the
final Experience API fix at `a3b3173` ships with the service image, not the Medusa image)
**Preview DB:** `buildkart_u009_preview` (clone of staging)
**Staging:** **not switched.** `release-186a50f` remains current.
**Production:** untouched.

---

## 1. Requirement ledger

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R1 | Migration creates `seller_delivery_rate` with unique + indexes; up/down clean | **PASS** (up) / **DEFERRED** (down) | Migration applied to `buildkart_u009_preview`; `\d seller_delivery_rate` shows unique `(seller_id,pincode)`, `(pincode,active)`, non-negative fee check, actor check. `down()` exists but was not run because the table is in active QC use. |
| R2 | Admin API + UI: list/search/filter, create, edit fee/active, delete, bulk import, validation | **PASS** (API) / **PASS-CODE** (UI) | HTTP QC below: list 200, create 201 (`flat_fee_minor=4900`, `updated_by=admin`), bulk `created=2 errors=1`, patch `6900 active=false`, delete 200, invalid pincode 422. Page at `apps/admin/src/routes/delivery-rates/page.tsx` follows the proven inventory-requests fetch pattern; it compiles in the image build but was not visually inspected. |
| R3 | Seller API + UI scoped to own seller; cross-seller access denied | **PASS-CODE** | Vendor routes resolve `seller_id` only from `vendorSellerId(req)`; every row lookup includes `seller_id`; unauthenticated vendor request returns **401** (HTTP QC). A member-authenticated vendor HTTP test is deferred (no staging vendor credentials in this session). |
| R4 | Admin edit wins; `updated_by` recorded | **PASS** | Admin create/patch writes `updated_by=admin`; seller writes `updated_by=seller`. The unique row per seller+pincode means the last write wins, and admin edits are indistinguishable except by the actor column, as specified. |
| R5 | One calculated Delivery option per seller; Standard/Express inactive for new carts; existing orders unchanged | **PASS** | Provisioning output: Delivery options created for all 5 sellers with `data.seller_id`; 10 legacy options flipped to `enabled_in_store="false"` (rows retained). Order history untouched (no order rows modified). |
| R6 | Home address binds to cart and resolves fee without a checkout visit | **PASS-CODE** | `customer-details` now applies delivery before returning; `POST /v1/carts/:id/delivery` re-resolves. App cart has a "Check delivery fee" bind action. No browser run in this session. |
| R7 | Cart shows per-seller fee and total; cart total includes it | **PASS-CODE** | Cart delivery lines are stored in cart metadata and exposed by `composeCartView`; `shipping_total` remains Medusa's authoritative total. Unit/UI tests updated; no live cart screenshot. |
| R8 | Checkout shows delivery read-only; only address required | **PASS** (code + widget test) | Tier radio removed; `checkout_canonical_flow_test` asserts no Standard/Express and two read-only seller lines; suite passes. |
| R9 | Missing row → ₹99; multi-seller sums fees | **PASS** | Live gate: seeded 302001 → 2900; missing 999999 → 9900; inactive → 9900. Multi-seller sum is the per-seller loop in `applyDeliveryForCart` (one method per cart seller). |
| R10 | Pincode change re-resolves; rate change affects new carts without deploy | **PASS** | Gate re-resolved 302001→999999→302001 on one cart; rate rows are read per request from the database. |
| R11 | Free-shipping offers still apply and render a discount line | **DEFERRED** | `shipping_discount_total` is already exposed by the API and rendered by the cart/checkout summary. No live FREESHIP/TRADEVIP cart was tested in this session. |
| R12 | Order API exposes `shipping_total`, `shipping_discount_total`, `total`; order page shows real fee | **PASS-CODE** | `composeCartView` maps all three; the order payload uses `medusaToMinor(cart.shipping_total)`. The app order screen prints `order.shipping` and only says "Free" when the amount is 0. No new order was placed in this session. |
| R13 | Tests: module/unit, API, Experience API, Flutter analyze/test; admin + vendor builds; 0 console errors | **PASS (with one known pre-existing golden)** | `tsc -b` PASS; Jest 5/5 PASS; `experience-api` `tsc --noEmit` PASS; `flutter analyze` clean; `flutter test --exclude-tags golden` 274/274 PASS; image build compiles the API, admin and vendor bundles. `visual_golden_test` "b2b checkout" fails on the base commit too (7.53% pixel drift) and is not caused by this change. |

---

## 2. Live Phase 0 gate (authoritative)

`medusa exec ./src/scripts/u009-live-gate.ts` on the preview image:

```json
{
  "status": "PASS",
  "checks": {
    "seeded_is_2900": true,
    "missing_is_9900": true,
    "inactive_is_9900": true
  },
  "steps": [
    { "step": "create_calculated_option", "status": "reused", "optionId": "so_01M66EPQ34KSFQ16ZR0EKK9M9J" },
    { "step": "seeded_pincode", "pincode": "302001", "amount": 2900 },
    { "step": "missing_pincode", "pincode": "999999", "amount": 9900 },
    { "step": "inactive_pincode", "pincode": "302001", "amount": 9900 }
  ]
}
```

This runs the real `listShippingOptionsForCartWithPricingWorkflow` and the
provider's `calculatePrice`, so the fee is a Medusa calculated shipping price —
not a line item and not a mutated global option price.

## 3. Admin API HTTP QC

| Call | Result |
|---|---|
| `POST /auth/user/emailpass` | 200, JWT |
| `GET /admin/buildkart/delivery-rates?seller_id=…` | 200, `count=1` |
| `POST /admin/buildkart/delivery-rates` (400001, ₹49) | 201, `flat_fee_minor=4900`, `updated_by=admin` |
| `POST /admin/buildkart/delivery-rates/bulk` (2 valid + 1 invalid) | 201, `created=2`, `errors=1` |
| `PATCH /admin/buildkart/delivery-rates/:id` | 200, `6900`, `active=false` |
| `DELETE /admin/buildkart/delivery-rates/:id` | 200 |
| `POST` with pincode `12345` | 422 `pincode must be exactly six digits.` |
| `GET /vendor/buildkart/delivery-rates` without auth | 401 |

## 4. Provisioning result

```
Delivery (calculated, seller tagged) × 5 sellers
Standard Shipping × 5 → enabled_in_store "false"
Express Shipping  × 5 → enabled_in_store "false"
```

Existing orders keep their recorded shipping method, name and amount; no order
row was modified.

## 5. Deferred register

| Item | Why | Next step |
|---|---|---|
| Vendor HTTP QC with a member session | No staging vendor credentials in this session | Log in as a seller member and repeat the CRUD matrix, including a cross-seller 404 |
| Cart → checkout → order E2E on preview | Needs the Experience API service pointed at the preview Medusa image | Run the app against preview and place one test order; capture cart/checkout/order screenshots |
| FREESHIP / TRADEVIP live cart | No promotion test in this session | Apply each code to a cart with a fee and assert the shipping discount line |
| Migration `down()` | Table in active QC use | Run on a throwaway clone before the release |
| Admin/Vendor page visual QC | No browser session against the preview dashboard | Open both pages, create/edit/delete/import, screenshot |
| Staging deploy | Brief forbids it; human gate only | Release bundle with migration → image → switch → health → proxy → QC |
| B2B Standard/Express selector | The API ignores the tier now (`/delivery`), but the B2B UI still renders the selector | Remove the selector in a follow-up or reuse the delivery card |

## 6. Residual risks

1. **Calculated options are unpriced in Mercur's store list.** Mercur's
   `listSellerShippingOptionsForCartWorkflow` prices flat options from the
   Pricing Module and does not call the fulfillment provider. The app therefore
   shows the amount from the **applied cart method** (authoritative) rather than
   the list. Any future UI that reads `/store/shipping-options.amount` for a
   calculated option would show 0.
2. **Bulk import is capped at 5,000 rows per request.** 19k pincodes must be
   sent in at least four batches (or four paste operations). The parser reports
   header/comment/invalid lines and de-duplicates by pincode.
3. **One rate row per (seller, pincode).** There is no history table; the audit
   is `updated_by` + `updated_at` on the current row, as specified.
4. **Preview-only artifacts remain on the host:** `buildkart_u009_preview`,
   `buildkart-u009-preview-api`, image `u009-preview`, and worktree
   `/opt/buildkart-preview-u009`. Remove after the release decision.

## 7. Rollback

- Staging: still on `release-186a50f`; nothing to roll back.
- Preview: stop and remove `buildkart-u009-preview-api`; drop
  `buildkart_u009_preview`; delete image `buildkart-hosted-pilot-medusa:u009-preview`.
