# Full B2C/B2B store QC — 19 Nov 2026

Environment: staging only. Payment, delivery and inventory are simulated. Production release remains
unauthorised.

Web release: `release-web-20261119-160503` (source `bae1bc0`); API `5639fe3`; CMS `ea16cf2`; admin `93eeac1`.

## 1. Orders placed

| Channel | Account | Order | Cart ref | Order group | Lines | Total |
|---|---|---|---|---|---|---|
| B2C | `rsoni001@gmail.com` | `BK-261119-PECZY3` | `cart_01M7T8FRKT44KBQ5HDK61NMHA4` | `og_01M7T8FW00BT1WGCBF03A0DMTQ` | 2 | ₹639.50 |
| B2B | `buyer.b2b01@buildkart.test` | `BK-261119-0W0KCD` | `cart_01M7T8GF7NG8MXTMEB868F4GBQ` | `og_01M7T8GJS1ZGXB0S6GBJX9ZVEC` | 1 (5 units) | ₹18,576.50 |

### B2C order

| Item | SKU | Qty | Unit | Line |
|---|---|---|---|---|
| Allen Key Set - Plastic Box | `BAUM-442S-442-9M-METRIC-9PC` | 1 | ₹229.50 | ₹229.50 |
| Bent Nose Pliers | `BAUM-111DC-6-150` | 1 | ₹339.45 | ₹339.45 |

Subtotal ₹568.95 · automatic offer −₹28.45 · delivery ₹99 · **total ₹639.50**.

### B2B order

| Item | SKU | Qty | Unit | Line |
|---|---|---|---|---|
| 1/2in Drive 24 Pcs Socket Set | `BAUM-237S1-SET-BI-HEX` | 5 | ₹3,890 (MOQ tier) | ₹19,450 |

Subtotal ₹19,450 · automatic offer −₹972.50 · delivery ₹99 · **total ₹18,576.50**.

## 2. Web store QC

| Check | Result |
|---|---|
| B2C quick add | 4 Add-to-cart buttons on Tools; added 2 lines; cart badge 2 |
| B2C cart | 2 lines; subtotal ₹568.95 |
| B2C checkout | Quote `568.95 − 28.45 + 99 = 639.50`; order confirmed |
| B2C orders page | New order at top: `BK-261119-PECZY3`, Confirmed, 2 items, ₹639.50 |
| B2C order detail | 2 lines, subtotal/shipping/discount/total correct; tracking `SIM-DF4333F1647C`, shipment booked |
| B2C notifications | 24 notifications / 10 unread; new “Your Order Confirmed” at top |
| B2B Add to cart | Added MOQ 5; cart badge 5; cart line ₹3,890 × 5 = ₹19,450 |
| B2B checkout | Quote `19,450 − 972.50 + 99 = 18,576.50`; order confirmed |
| B2B orders page | New order at top: `BK-261119-0W0KCD`, Confirmed, ₹18,576.50 |
| B2B notification | `order_confirmed_v1` created for `pilot_buyer_b2b01` |
| Public routes | `/`, `/discover`, `/search`, `/search?cat=…`, `/cart`, `/trade`, `/wishlist` and all six policy pages return `200`; `/checkout`, `/orders`, `/notifications`, `/trade/catalogue`, `/trade/quick-order` correctly redirect (`307`) when signed out |
| API health | `200`, `nats=connected`, `identity_store=connected`, `payment_mode=simulated` |
| Runtime errors | No page errors on B2C run; no failed requests; no web/API/event-worker error lines in the last 45 minutes |

Receipt copy now says **“Order total”** and **“Simulated payment · test data”**, not “Total paid”,
because the backend payment is authorized-only (finding 3.1).

## 3. Backend QC — findings

### 3.1 Payment is authorized, not captured — blocker for a production-shaped order

| Order | Payment collection | Collection status | Authorized | Captured | `payment.captured_at` | Medusa order status |
|---|---|---|---|---|---|---|
| B2C | `pay_col_01M7T8FVSRAR8EKNNYV92W6GJK` | `authorized` | ₹639.50 | ₹0 | null | `pending` |
| B2B | `pay_col_01M7T8GJKKXKJ66MTM99FAHQ9T` | `authorized` | ₹18,576.50 | ₹0 | null | `pending` |

The simulated provider implements `capturePayment`, but checkout completion only authorizes. The
order summaries therefore show `paid_total = 0` and `pending_difference` equal to the full total.
This is a pre-existing staging gap (the earlier order #113 capture was performed manually in Admin),
not introduced by the web tile/checkout changes. A production-shaped checkout must capture or
explicitly mark the authorized payment as the intended settlement state.

### 3.2 Tryton inventory reservation/reconciliation is not started

Both orders have no `reservation` row and no `tryton_move_id`. Admin reconciliation returns
`reconciled: false`, mismatch `RESERVATION_OR_ORDER_MISSING`, and recovery actions:

```text
POST /v1/checkouts/<cart>/reserve
POST /v1/checkouts/<cart>/commit
```

The reservation endpoint accepts one SKU per checkout, so the two-line B2C order also exposes a
multi-line reservation design gap. This is a pre-existing inventory gap (also recorded in CHG-084).

### 3.3 Order/payment-collection link is absent

`order_payment_collection` has zero rows for both checkout-created orders, although the payment
collection exists and is referenced by correlation. This is the same integration gap recorded for
order #113; it blocks native refunds until repaired and must be fixed in the order creation path,
not by manual inserts.

### 3.4 What did work

- Correlation rows exist with owner, order group, amounts and line snapshots.
- `order.confirmed` domain events are present and published to the outbox.
- `pilot_notification` rows exist with `order_confirmed_v1` and correct deep links.
- Simulated shipments are booked with tracking numbers for both orders.
- Medusa order/order-line totals and quantities match the API totals; line prices are correct.
- Admin order queue lists both orders; reconciliation/queue access works on the ops host.
- No application errors or failed requests during the order flows.

## 4. Verdict

**Web store:** pass for the B2C and B2B shopping/checkout journeys on the new tiles, drag-scroll
lanes, cart cross-sell and order pages.

**Backend:** order, payment authorization, notification, shipment and outbox paths work, but the
orders are **not financially settled** (authorized only, no capture) and **not inventory
reconciled** (no Tryton reservation). These are staging-blocking gaps for a production-shaped
release, and the order/payment link gap remains open.
