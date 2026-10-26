# Evidence — staging order placement and admin review (SKU-exact journey)

- **Follow-up to:** CHG-080 (SKU-level Bought Together), verifying the paired SKU survives a real checkout
- **Date:** 2026-10-26
- **Environment:** staging only; production untouched and unauthorized
- **Lane / release mechanism:** none — read-only QA plus one authorized staging test order; no code change, no deployment
- **Surfaces:** `https://buildkart-staging.web.app`, `https://ops-staging.pinakaplay.cloud/dashboard/`

## 1. Purpose and scope

Confirm the canonical Flutter storefront can complete a purchase for the SKU-scoped pair and that the
resulting order is reviewable by an operator in the Mercur admin console.

Allowed data writes: one OTP session, one cart with one line, one `test_data=true` order, and the
normal downstream allocation, shipment and notification records. No product, price, offer, pairing,
inventory, fulfilment, refund or configuration record was edited.

## 2. Baseline

| Item | Value |
|---|---|
| Repository | `feat/bt-sku-pairs` @ `98d6a83` (clean) |
| Storefront bundle | `8150e0e` (SHA-256 `ea044752…873c144`) |
| Admin order groups before | 13 (latest `#G109`) |
| Pilot customer orders before | 7 |
| Health | storefront 200, Experience API 200, ops 200, dashboard 200 |
| Customer | `rsoni001@gmail.com`, OTP `123456` (staging pilot) |
| Target product | `1/2in Drive 24 Pcs Socket Set` (`prod_01M59JHKBZ41EJTYW3X6MCXZC6`) |
| Target SKU | `BAUM-237S1-SET-HEX` (`variant_01M59JHKJY5V256TMSGAWZV633`), qty 1, ₹3,990 |

## 3. Journey executed

All steps were driven through the deployed web UI with the Flutter accessibility tree enabled; the
browser was headless Chromium at 390×844.

1. Onboarding → pilot login (email + OTP) — **pass**.
2. SKU-exact PDP renders `SKU BAUM-237S1-SET-HEX`, `₹3990`, MRP `₹4750`, `16% off` — **pass**.
3. Buy Now created one cart with one line: `BAUM-237S1-SET-HEX`, qty 1, unit `399000` minor — **pass**.
4. Checkout showed the signed-in contact, one seller, Standard ₹99 / Express ₹199, simulated prepaid
   payment, subtotal ₹3,990, shipping ₹99, total ₹4,089 — **pass**.
5. Place order returned `type=order_group`, `payment_mode=simulated`, `payment.test_data=true` —
   **pass**.
6. Confirmation screen `Order Confirmed` — **pass**.
7. Customer `My Orders` read model includes the new order with the exact SKU, quantity and unit price —
   **pass** (presentation findings in §6).

Result:

| Field | Value |
|---|---|
| Cart (checkout ref) | `cart_01M5VWD5Q156Y5BQ6CX8H4TRTS` |
| Order group | `og_01M5VWW4KMVYZ4HMEE6V24ZSBC` |
| Admin group / order | `#G110` / `#127` (`order_01M5VWW4K5QGJPAQA5A5R1XWNH`) |
| Seller | BuildMaster Supplies (`sel_01M4EC9C7YNSFGCG6A4B3Q6PG8`) |
| Sales channel | B2C Storefront |
| Item / shipping / total (minor) | 399000 / 9900 / 408900 |
| Payment | `pp_simulated_simulated`, authorized, uncaptured |
| Correlation id | `7c5e8c1771365ca83857d9f306a6157e` |

No duplicate cart or order was created: the pilot had exactly one cart on 2026-10-26 and it completed
into one order group. An earlier interrupted Buy Now attempt produced that same cart, which was
resumed rather than re-created.

## 4. Server-side confirmation (queried, not client-asserted)

| Check | Result |
|---|---|
| `correlation` row | group linked, `payment_evidence.payment_mode=simulated`, `test_data=true` |
| `domain_event` | `order.confirmed` for the group, **published** to the outbox |
| `pilot_shipment` | `ship_2f3fee2c…` booked, simulated provider, tracking `SIM-D7E624300796`, `test_data=t` |
| `reservation` | **no row** — see F4 |
| `/v1/admin/orders/{id}/reconciliation` | `reconciled: false`, `mismatch_codes: [RESERVATION_OR_ORDER_MISSING]` |

## 5. Admin review

`/dashboard/orders` lists `#G110` with `#127`, 1 store, 26 Oct 2026, order total, and `#127` with
BuildMaster Supplies, `Authorized`, `Not fulfilled`. Opening `#127` shows:

- order operations: Payment Authorized, Refunded none, Delivery Booked (0 of 1 units), Return none;
- line `1/2in Drive 24 Pcs Socket Set` / `BAUM-237S1-SET-HEX` / `Set - Hex`, 1×, **Allocated**;
- item subtotal, shipping subtotal, tax, commission and order total;
- payment collection `Authorized` — `Pp_simulated_simulated`, `Pending`, with a **Capture payment** action;
- customer `Pilot Tester 1`, `rsoni001@gmail.com`, `+91 98765 43210`, correct Bhiwadi shipping address;
- shipment `SIM-D7E624300796`, status Booked.

The SKU, quantity, seller, channel, buyer and address therefore reconcile correctly between the
storefront and admin.

## 6. Findings (pre-existing, outside the CHG-080 change)

| ID | Severity | Finding | Evidence it is pre-existing |
|---|---|---|---|
| F1 | High | Native admin order screens display money 100× too large: `₹399,000.00` for a ₹3,990 line, shipping `₹9,900.00`, total `₹408,900.00`. Admin stores/renders minor units as major units; the storefront divides by 100. | Every earlier group shows the same scaling (`#G108` ₹139,800.00 for a 139800-minor order); the product-side admin widget divides by 100 while order screens do not. |
| F2 | Medium | Storefront confirmation says “Payment confirmed · GST invoice will be issued” while admin shows Payment **Authorized**, `Total paid ₹0.00`, `Outstanding ₹408,900.00` and a capture action. Simulated payment authorizes but never captures. | Most staging payment collections have `captured_amount = 0`; only one older order was captured manually. |
| F3 | Medium | Customer `My Orders` uses the raw cart id as the order reference (`BK-cart_01M5VWD5Q156Y5BQ6CX8H4TRTS`) instead of the merchant order number (`#127`). | `CustomerOrder.fromApi` derives `number` from `order_id`; `/v1/me/orders` exposes no display id. All earlier orders show the same pattern. |
| F4 | Medium | No Tryton reservation exists for any order; reconciliation reports `reconciled: false` / `RESERVATION_OR_ORDER_MISSING`. The UI checkout never calls `/reserve` + `/commit`; only the acceptance script does. | `reservation` table has 0 rows and all 8 recent order groups have `tryton_move_id = null`. |
| F5 | Low | Customer order card total excludes shipping: ₹3,990 shown for a ₹4,089 order. | `CustomerOrder.total` sums line totals only; `/v1/me/orders` exposes no order-level money. |

None of these were introduced by `8150e0e`; the release diff contains only the Bought Together request,
provider lifetime, PDP wiring and its regression test.

## 7. Requirement ledger

| ID | Requirement | Status |
|---|---|---|
| R1 | Storefront login → SKU-exact cart → checkout completes | **PASS** |
| R2 | Order is canonical simulated staging data (`order_group`, `test_data`, outbox event) | **PASS** |
| R3 | Admin shows the same order, SKU, quantity, seller, buyer and address | **PASS** |
| R4 | No duplicate cart or order; no catalogue/pricing/pairing mutation | **PASS** |
| R5 | Storefront/admin console clean during the journey | **PASS** — 0 console errors, 0 failed requests |
| R6 | Admin money and payment state match the customer's view | **FAIL** — F1, F2 (pre-existing) |
| R7 | Inventory reservation reconciles | **FAIL** — F4 (pre-existing) |
| R8 | No code change or deployment in this bundle | **PASS** |

## 8. Boundary and residual risk

- Staging only; no production action, credential rotation or configuration change.
- The test order is intentionally retained as audit evidence; it was not deleted, fulfilled, captured
  or refunded.
- Admin password and pilot sessions are not recorded here.
- Recommended follow-up: a single governed change for admin money normalisation (F1) plus the
  payment-copy/capture decision (F2), customer order identity and total (F3, F5), and the
  reservation gap (F4). These are pre-existing and need a human scope decision.

## 9. Screenshots

- `screenshots/flutter-order-pdp-baum-237s1-set-hex-390x844.png`
- `screenshots/flutter-checkout-review-390x844.png`
- `screenshots/flutter-order-confirmed-390x844.png`
- `screenshots/flutter-my-orders-390x844.png`
- `screenshots/admin-orders-group-g110-1440x1000.png`
- `screenshots/admin-order-127-detail-1440x1000.png`
