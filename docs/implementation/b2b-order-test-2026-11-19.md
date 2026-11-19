# B2B channel switch and order test — 19 Nov 2026

Status: **passed (order placed)** · Web release `release-web-20261119-181458`
Order: **`BK-261119-N6H7VJ`** · Staging only · Synthetic data

## Flow exercised

1. Signed in on the consumer host (`gobazarbee.com/sign-in`) with the staging B2B pilot account
   `buyer.b2b01@buildkart.test`.
2. Confirmed the header channel switch exposed **Shop / Trade**.
3. Clicked **Trade** → `/trade`.
4. Opened `/trade/catalogue`, selected the first trade tile (1/2in Drive 24 Pcs Socket Set) and used
   **Add to cart** at the MOQ tier.
5. Cart: 5 × ₹3,890 = **₹19,450** (B2B tier price, not the consumer price).
6. Checkout quote: ₹19,450 subtotal − ₹972.50 automatic offer + ₹99 standard delivery =
   **₹18,576.50**.
7. Placed the order and confirmed the success page.
8. Orders page listed the new order at the top.

## Order record

| Field | Value |
|---|---|
| Customer-facing reference | `BK-261119-N6H7VJ` |
| Order id | `order_01M7TGCVWFNS71R3CSR4GQJCAR` |
| Order group | `og_01M7TGCVWRBCN8GZ5Y5P0N2614` (display 190) |
| Cart | `cart_01M7TGCS4MFYVHG84DNV4NZ7ZY` |
| Metadata channel | `b2b` |
| Business account | `business_arjun_traders` |
| Line | 1/2in Drive 24 Pcs Socket Set ×5 @ ₹3,890 |
| Order total | ₹18,576.50 |
| Currency | INR |
| Order status | `pending` |

The `order.metadata.channel = "b2b"` and `business_account_id` confirm this is a B2B order, not a
consumer order that merely used the trade catalogue.

## Backend state

| Check | Result |
|---|---|
| Payment collection | `pay_col_01M7TGCVQE620F6XCZWTAMZYAK` |
| Authorized | ₹18,576.50 |
| Captured | **₹0** |
| Payment status | `authorized` |
| `order_payment_collection` link | **0 rows** (existing integration gap) |
| `order_summary.paid_total` | 0 |
| `order_summary.pending_difference` | ₹18,576.50 |
| Inventory reservation | **Present** — `resitem_01M7TGCW0HAFCVG3NT7ZCG10HA`, quantity 5 |
| Tryton move | Not checked in this pass; reservation row exists |

The reservation row is a positive difference from the earlier B2C/B2B QC, which found no reservation
rows. Payment capture and the order/payment-collection link remain open, matching the known findings
in `full-store-qc-2026-11-19.md`.

## Code change needed for the test

The shared B2B tile and trade PDP had only **Add to quote** after the B2B parity pass. The earlier
B2B order flow used the standard cart. A secondary **Add to cart** action was restored on both:

- `apps/web/app/trade/trade-product-card.tsx`
- `apps/web/app/trade/pdp/[id]/trade-pricing-panel.tsx`
- `apps/web/app/globals.css`

It adds the selected MOQ/tier quantity at the tier unit price, so the existing `/cart` → `/checkout`
path can create a B2B order. This is additive; Add to quote and the quote stepper are unchanged.

## Verdict

The channel switch and B2B ordering journey work end to end on web. The order is canonical and
owner-scoped, with B2B pricing and B2B metadata. It is **not financially settled**: payment is
authorized-only, captured is zero, and the order/payment link is missing. Treat this as a staging
order, not a production-ready settlement.

No production release was involved.
