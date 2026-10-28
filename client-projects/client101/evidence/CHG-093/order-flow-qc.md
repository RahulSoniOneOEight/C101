# CHG-093 — B2C and B2B order flow QC

Date: 2026-10-29
Environment: staging (`release-23bb104`)
Status: QC complete. Findings below are facts, not fixes.

## Headline

| Channel | Can an order be placed? | Result |
|---|---|---|
| B2C — customer web | **No** | Checkout fails with `A pilot bearer session is required`. |
| B2C — app/API | **Yes** | Order group, order, shipment and notification created; ERP/payment gaps below. |
| B2B — customer app | **No** | `placeOrder` writes local app state only; no API call, no canonical order. |
| B2B — API cart | Cart only | `channel=b2b` is stored, but the line is priced at the B2C amount and a B2C promotion is applied. |

## B2C web checkout — FAIL

Reproduced as a signed-in owner on the staging web:

1. Sign in with the simulated OTP.
2. Open `Checkout` for an in-stock offer.
3. Submit `Place order`.

Result: `Checkout failed: A pilot bearer session is required`.

Cause: the web checkout form calls `/api/checkout`; that route calls `completeCheckout()`, which
creates the cart with `POST /v1/carts` **without an Authorization header**. The API correctly
returns 401. The browser session is never forwarded.

Evidence: `web/checkout-form.png`, `web/checkout-result.png`.

## B2C order — PASS with gaps

Placed through the authenticated path the app uses (same endpoints, owner token):

| Field | Value |
|---|---|
| Cart | `cart_01M623CTCV1FGY33NF4BP8PTCN` (channel `b2c`) |
| Order group | `og_01M623D0Q3GES1MMFE8VYAEFC2` |
| Order | `#148` / `order_01M623D0NTGQF67FRV62HP564N` |
| Line | `XZ5QR` · qty 1 · ₹436.90 |
| Totals | subtotal ₹436.90 + shipping ₹99 − FLAT5 ₹21.85 = **₹514.05** |
| Payment | simulated session `authorized` |
| Shipment | `ship_4d5fbaba…` · booked · UrbanBuild Supply |
| Notification | `order_confirmed_v1` |
| Customer web | order listed; detail shows line, shipment and total |
| Admin | #148 visible; Payment Authorized, Not fulfilled, Booked |
| Seller (UrbanBuild) | #148 visible with the delivery/returns widget |

### Gaps found

1. **Payment is not linked to the order.** `order_payment_collection` has 1 row in total while 32
   carts have payment collections. The simulated session stays `authorized` on the cart; the order is
   `pending`, Paid Total ₹0.00, Outstanding ₹514.06.
2. **No ERP reservation.** `tryton_move_id` is null; `stock_move` stayed at 55. Across staging,
   **0 of 161** correlations have a Tryton move and `reservation` is empty. The API exposes
   `POST /v1/checkouts/{id}/reserve` and `/commit`, but no client calls them.
3. A seller deep-linking another seller's order sees a generic "An error occurred" page; the owning
   seller sees the order normally. UX only.

## B2B — NOT PLACEABLE

### App

`B2BQuotationCartNotifier.placeOrder()` builds a `B2BOrder` and stores it in local state. It does not
call the cart, checkout or order APIs. The workspace explicitly cannot create orders. The B2B order
history is therefore app-local.

### API cart probe

| Field | Value |
|---|---|
| Buyer | `pilot_buyer_b2b01` (role `b2b_buyer`) |
| Product | Wonder Cement (`prod_01M5Q98Y7CEHEPKZENTNGF9CVW`) |
| B2C display price | ₹400.00 |
| B2B display price | **₹350.00** |
| Cart | `cart_01M623F1HHR74KGVYBEQEBEMVC` |
| Cart channel | `b2b` |
| Business account | `business_arjun_traders` |
| Cart line price | **₹400.00** (B2C) |
| Applied promotion | `FLAT5` −₹20.00 |
| Cart total | **₹380.00** |

The cart is correctly tagged B2B, but the line uses the B2C amount and the B2C automatic promotion is
applied. `composeOffers` reads the B2B amount from product metadata (read-side only); the cart has no
B2B price context. Placing this cart would create an order that looks B2B but is priced B2C, so no
checkout was completed.

## Data written

| Record | Disposition |
|---|---|
| B2C order #148, group, shipment, notification | Kept as staging test data |
| B2C cart payment collection + authorized simulated session | Kept; see gap 1 |
| B2B cart `cart_01M623F1HHR74KGVYBEQEBEMVC` | Abandoned; no payment, no order |
| B2B B2B display/session data | None |

No Medusa refund, Tryton stock move, carrier or settlement effect was created.

## Evidence

- `web/checkout-form.png`, `web/checkout-result.png`
- `b2c/web-orders.png`, `b2c/web-order-detail.png`, `b2c/admin-order.png`,
  `b2c/seller-order-urbanbuild.png`
- `b2c-visibility-qc.json`
- Tools: `tools/web-checkout-probe.cjs`, `tools/b2c-visibility-qc.cjs`

## Recommended next steps

1. **Fix web checkout auth** (small): forward the HTTP-only session from `/api/checkout` to
   `completeCheckout`, or require sign-in on the checkout page. Re-run the web path.
2. **Decide B2B pricing**: cart-level B2B price override from the studio snapshot, or a Medusa price
   list/customer-group context. Then wire `placeOrder` to the cart/checkout API.
3. **Payment linkage**: attach the payment collection to the completed order(s) and define simulated
   capture (paid vs authorized).
4. **ERP reservation**: call `/reserve` (and `/commit` on capture) from the checkout flow, or make the
   event consumer do it.
