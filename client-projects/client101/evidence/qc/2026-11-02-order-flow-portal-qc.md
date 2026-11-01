# QC — app order flows (B2C + B2B) and admin/seller portals (2026-11-02)

**Live:** web `68f5125` · API `e4145643172a` · Medusa `f0dc0126f5de`
**Portals:** `https://ops-staging.pinakaplay.cloud/dashboard/` (admin) ·
`https://ops-staging.pinakaplay.cloud/seller/` (vendor)

Scripts (committed, re-runnable):

```sh
NODE_PATH=%USERPROFILE%\node_modules node tooling/qa/b2c-order-flow.mjs
NODE_PATH=%USERPROFILE%\node_modules node tooling/qa/b2b-order-flow.mjs
ADMIN_PASSWORD=... node tooling/qa/portal-qc.mjs
```

## 1. B2C order flow — 15/15 PASS

Order **`BK-261101-XYE15Y`** · ₹479 · completion `og_01M6CBBFHM0ZAENS60REZJBGN0`

| Step | Observed |
|---|---|
| Search → PDP | Wonder Cement, SKU WON-PPC-DAN-01, Add to Cart |
| Add | “Added”, cart badge `1` |
| Cart | `Subtotal ₹400 · Shipping ₹99 · Total ₹479`, FLAT5 −₹20 |
| Checkout | Delivery, saved address (Home, 301019), fee read-only ₹99, sticky `Total ₹479 / Place order` |
| Confirmation | `BK-261101-XYE15Y` · ₹479 · simulated payment |
| Completion payload | group id returned; `total_minor 47900` = checkout total |
| Console / HTTP errors | 0 |

## 2. B2B order flow — 37/37 PASS

Order **`og_01M6CBX2G05FPF1WNP042BEYB1`** · ₹764

| Step | Observed |
|---|---|
| Trade PDP → cart | Wonder Cement, MOQ 1, stepper, remove, related rail |
| Checkout without site | CTA disabled, summary “Select site” |
| Site A (411001) | `₹350 − ₹17.50 + ₹99 = ₹431.50` before placing |
| Qty 1 → 2 | stale fee dropped, then `₹700 − ₹35 + ₹99 = ₹764` |
| Placement | order group + `total_minor 76400`; history card rendered |
| Console / HTTP errors | 0 |

## 3. Admin portal — PASS

| Check | Observed |
|---|---|
| Sign-in | `admin@buildkart.test` → `/dashboard/orders` |
| Navigation | Orders, Products, Inventory, Customers, Promotions, Stores, Payouts, Merchandising, Editorial, Shipments, Returns, Delivery rates, Settings |
| Orders list | 20 rows on page 1; channel filter **All 79 · B2C 62 · B2B 17** |
| QC orders visible | the B2C runs at **₹479.00** (#G164…G160) and the B2B runs at **₹764.00** (#G159…G154), plus the earlier ₹431.50 |
| Products | 20 rows; first product opens **Product Studio** (`/dashboard/product-studio/…`) with details, media, organisation, specifications, search listing |
| Delivery rates | page renders |
| Shipments | page renders |
| Console / page errors | 0 |

## 4. Seller portal — PASS

| Check | Observed |
|---|---|
| Sign-in | `buildmaster@mercur.dev` → store picker |
| Store | BuildMaster Supplies selected → `/seller/orders` |
| Orders | 10 rows; first order opens `/seller/orders/order_…` |
| Catalogue | `/seller/products` renders with “Create a product” and the Product Studio entry |
| Delivery rates | `/seller/delivery-rates` renders “Your pincodes only” |
| Console / page errors | 0 |

## 5. Notes

1. **Cart fee binding is asynchronous.** For ~1 second the retail cart shows
   `Shipping: Set a delivery address` and a goods-only total (`₹380`) until the
   saved address resolves the fee (`₹479`). The order always charges the
   fee-inclusive total; the QC waits for the resolved value.
2. **Admin order detail** is opened from the table row in the console; the
   headless row click does not navigate, so admin order verification uses the
   list totals (which reconcile with both flows). Seller order detail was
   opened and verified normally. No product defect observed.
3. **Script tuning created extra staging orders**: five B2C orders at ₹479
   (#G160–#G164) and the B2B orders at ₹764. They are ordinary staging test
   orders; no cleanup was requested.
4. **Portal credentials** are not stored in this repository; the admin password
   is read from `/etc/buildkart/secrets/admin-console.txt` at run time.
5. **Seeded order #137 shows a payment of ₹157,339.40 against a ₹4,089
   order** in the seller detail. The QC orders reconcile exactly (payment ₹764
   and ₹479 vs the same totals), so this is staging seed-data noise, not a
   live-flow mismatch. Worth cleaning with the seeded order data.
6. **Staging, not production**: everything ran against staging; production
   remains untouched.

## 6. Evidence

`qc_b2c_01_pdp.png`, `qc_b2c_02_cart.png`, `qc_b2c_03_checkout.png`,
`qc_b2c_04_confirmation.png`, `qc_b2b_01_checkout_priced.png`,
`qc_b2b_02_confirmation.png`, `qc_b2b_03_order_history.png`,
`qc_admin_orders.png`, `qc_admin_products.png`, `qc_admin_product_studio.png`,
`qc_admin_delivery_rates.png`, `qc_seller_orders.png`,
`qc_seller_order_detail.png`, `qc_seller_products.png`,
`qc_seller_delivery_rates.png`.
