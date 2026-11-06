# QC — order detail pages in the admin and seller consoles (2026-11-07)

**Live:** web `68f5125` · API healthy · portals `ops-staging.pinakaplay.cloud`
**Script:** `tooling/qa/order-page-qc.mjs` (re-runnable)
**Orders:** `#191` B2C ₹479 (rsoni001@gmail.com) · `#192` B2B ₹764
(buyer.b2b01@buildkart.test), both PowerMax Depot.

**Result: 25 / 25 checks PASS · 0 console/page errors in either console.**

## 1. Admin — order #191 (B2C)

| Panel | Observed | Result |
|---|---|---|
| Header | `#191` · `Nov 2, 2026 1:33 AM from B2C Storefront` | PASS |
| Operations | Payment **Authorized / Ready to capture**; Delivery **Booked · 0 of 1 units**; Returns **No return requested**; Refund **No refund issued** | PASS |
| Payments | Authorized ₹479.00 · Captured ₹0.00 · Refunded ₹0.00 · **Outstanding ₹479.00** | PASS |
| Summary | Wonder Cement · WON-PPC-DAN-01 · ₹400.00 ×1 · Item Subtotal ₹400.00 · Shipping ₹99.00 · Commission ₹12.00 · Order Total ₹499.00 · Discount ₹20.00 · **Total After Discount ₹479.00** | PASS |
| Delivery | Shipment SIM-187A4B3865AD v1, **Booked**, delivered 0 of 1 units, seller code, timeline + update status | PASS |
| Customer | rsoni001@gmail.com · +91 98765 43210 · shipping address Bhiwadi 301019 | PASS |

## 2. Admin — order #192 (B2B)

| Panel | Observed | Result |
|---|---|---|
| Flagging | **B2B trade order** badge · `B2B channel · business account business_arjun_traders` | PASS |
| Payments | Authorized ₹764.00 · Captured ₹0.00 · **Outstanding ₹764.00** | PASS |
| Summary | ₹350.00 ×2 = ₹700.00 · Shipping ₹99.00 · Commission ₹21.00 · Order Total ₹799.00 · Discount ₹35.00 · **Total After Discount ₹764.00** | PASS |
| Delivery | Booked · 0 of 2 units | PASS |
| Customer | buyer.b2b01@buildkart.test · Arjun Traders Procurement · Site A, Pune 411001 | PASS |

## 3. Seller — orders #191 and #192 (PowerMax Depot)

| Panel | #191 (B2C) | #192 (B2B) |
|---|---|---|
| Scope banner | “Seller-scoped operations for this order. **Payment and refunds are managed by BuildKart Admin**.” | same |
| Delivery / returns | Booked · 0 of 1 units · No return | Booked · 0 of 2 units · No return |
| Line price | ₹400.00 ×1 | ~~₹400.00~~ **₹350.00** ×2 (trade price vs list) |
| Item Total | ₹380.00 (after ₹20 FLAT5) | ₹665.00 (after ₹35 FLAT5) |
| Shipping | ₹99.00 | ₹99.00 |
| Commission | ₹12.00 | ₹21.00 |
| Order Total | **₹ 479.00 INR** | **₹ 764.00 INR** |
| Paid / Outstanding | ₹0.00 / ₹479.00 | ₹0.00 / ₹764.00 |
| Customer | rsoni001@gmail.com | buyer.b2b01@buildkart.test |

Both seller pages reconcile to the same totals the admin and the app show.

## 4. Findings

### OP-1 — B2B orders are labelled “from B2C Storefront” (both consoles)

`#192` is a B2B order — the operations panel says **B2B trade order / B2B channel /
business_arjun_traders** — but the dated header says **“from B2C Storefront”**, and
the seller page repeats it.

Cause: Medusa’s store publishable key is bound to a single sales channel, so the
app records B2B on the B2C sales channel and carries the real channel in cart /
order metadata (`channel: b2b`, `business_account_id: business_arjun_traders`).
The header reads `sales_channel_id`; the operations panel reads metadata.

Recommendation: render the origin label from `order.metadata.channel`
(`b2b` → “B2B Trade Portal”, `b2c` → “B2C Storefront”) and keep the technical
sales-channel name in the channel panel. No data change needed — the metadata is
already correct on every order.

### OP-2 — Customer card “ID” row shows an avatar initial, not the customer id

The Customer panel renders `ID · (A) Arjun Traders Procurement` / `ID · (P) Pilot
Tester 1`; the real ids are `cus_01M4EMM2916C9EAAT9DARKRB8P` and
`cus_01M4EJSY8TYR5YV36ASS7R05X5`. Minor: an operator cannot read or copy the
customer id from that row.

## 5. Method notes

- Pages were opened by their canonical order URLs (`/dashboard/orders/{id}`,
  `/seller/orders/{id}`). The admin list row does not navigate under headless
  Playwright (hover/pointer quirk); the same rows are clickable in a real
  browser. Not a product defect.
- Both consoles were signed in with the staging accounts; the admin password is
  read from `/etc/buildkart/secrets/admin-console.txt` at run time and is not
  stored in the repository.
- Staging only; production untouched.

## 6. Evidence

`order_page_admin_191_top.png`, `order_page_admin_191_delivery.png`,
`order_page_admin_192_top.png`, `order_page_admin_192_summary.png` (header +
summary for the B2B order), `order_page_seller_191_top.png`,
`order_page_seller_192_top.png`.
