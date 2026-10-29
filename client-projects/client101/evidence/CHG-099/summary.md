# CHG-099 — B2C and B2B web order end-to-end QC

**Status:** STAGING VERIFIED
**Environment:** staging only. Production was not touched.
**Completed:** 2026-10-30

## 1. Surface distinction

| Channel | Web surface | Result |
|---|---|---|
| B2C | `https://app-staging.pinakaplay.cloud` (Next.js store) | Order placed and verified |
| B2B | `https://buildkart-staging.web.app` (Flutter B2B web storefront) | Order placed and verified |

The Next.js store is B2C-only. It has no B2B channel checkout route. The B2B web
storefront is the deployed Flutter web app.

## 2. Orders placed

### B2C — order #157

| Field | Value |
|---|---|
| Buyer | `nihar1008.nj@gmail.com` / Pilot Buyer |
| Order group | `og_01M64F05T378NMFSSY60VWNEPG` |
| Order ID | `order_01M64F05SPJ1J1PWC4DM65S355` |
| Cart | `cart_01M64F014V13X98CX9H4S512JW` |
| Order number | `BK-261029-NNNWJR` |
| Line | Action Tesa HDHMR Board / `XZ5QR` / qty 1 / ₹436.90 |
| Shipping | ₹99.00 |
| Discount | FLAT5 −₹21.85 |
| Total | **₹514.055** (₹514.06) |
| Seller | UrbanBuild Supply |
| Payment | Simulated, authorized, test data |
| Shipment | Booked / simulated |

### B2B — order #158

| Field | Value |
|---|---|
| Buyer | `buyer.b2b01@buildkart.test` / Arjun Traders |
| Order group | `og_01M64F1BG5RJ1WYAEFTZQ8878Z` |
| Order ID | `order_01M64F1BFS22TM4VKHJ8GZ66GH` |
| Cart | `cart_01M64F18EAP0P0QD1753N50W3E` |
| Order number | `BK-261029-Y1HVZA` |
| Line | Wonder Cement / `WON-PPC-DAN-01` / qty 1 / **₹350.00** |
| Compare-at | ₹400.00 |
| Discount | FLAT5 −₹17.50 |
| Shipping | ₹99.00 |
| Total | **₹431.50** |
| Seller | PowerMax Depot |
| Payment | Simulated, authorized, test data |
| Shipment | Booked / simulated |
| Admin badge | **B2B trade order** + business account |

## 3. End-to-end QC results

| Surface / check | Result |
|---|---|
| B2C web checkout + customer readback | **24/24 PASS** |
| B2B web checkout + confirmation | **10/10 PASS** |
| Admin + Seller cross-surface checks | **18/18 PASS** |
| B2B customer API readback | PASS |
| B2C Admin order #157 | PASS — ₹514.06, Authorized, Booked |
| B2B Admin order #158 | PASS — ₹431.50, Authorized, Booked, B2B badge |
| UrbanBuild sees #157 | PASS |
| UrbanBuild cannot see #158 | PASS |
| PowerMax sees #158 | PASS |
| PowerMax cannot see #157 | PASS |
| Customer / Admin / Seller console errors | 0 unexpected |
| Horizontal overflow | none observed |

### B2B customer readback

`GET /v1/orders/cart_01M64F18EAP0P0QD1753N50W3E` returned:

- order group `og_01M64F1BG5RJ1WYAEFTZQ8878Z`
- total `43150` minor units
- shipment `booked` / `SIM-59F11E0B7FD2`
- payment mode `simulated`
- reservation status `not_started`
- reconciled `false`

## 4. Known gaps / residual risks

1. **Next.js web store has no B2B checkout.** B2B orders must use the Flutter B2B
   web storefront. Adding B2B to the Next.js store is a separate change.
2. **Native label still says “from B2C Storefront”** on the B2B order because the
   shared Medusa sales channel is B2C. The Admin page now shows an explicit
   **B2B trade order** badge; the Seller portal does not yet.
3. **`order_payment_collection` has no rows for either order.** The simulated
   payment is authorized on the cart and visible in Admin, but not linked to the
   order. This is the pre-existing payment-linkage gap recorded in CHG-093.
4. **B2B reservation is `not_started` and `reconciled=false`.** No Tryton stock
   reservation is created by checkout. This is the pre-existing ERP gap.
5. **No Medusa fulfillment rows.** The booked shipment is created by the
   Experience API simulated logistics lifecycle, not Medusa fulfillment.

None of these are regressions from CHG-098/CHG-099; they are recorded so the
handoff does not overstate completeness.

## 5. Release identity

| Item | Value |
|---|---|
| API/Admin | `release/chg-098-2` / `186a50f8f69c5d9d436ab53c8c7e8dbf1c270f5` |
| Flutter web | `8482e94f797b20e8ca85b9fa33688f97c8ee7b24` |
| Staging current | `/opt/buildkart-releases/release-186a50f` |
| Medusa image | `sha256:d65bb7b46761` |
| Rollback | `release-6c776fc` / `buildkart-hosted-pilot-medusa:rollback-6c776fc` |

## 6. Evidence

- `b2c-web-order-qc.cjs`, `b2c-web-checkout-qc.json`
- `b2b-web-order-qc.mjs`, `b2b-web-order.json`
- `b2b-customer-readback.mjs`, `b2b-customer-readback.json`
- `cross-surface-qc.mjs`, `cross-surface-qc.json`
- `orders-readback.json`
- `admin-b2c-157.png`, `admin-b2b-158.png`
- `seller-b2c-157.png`, `seller-b2b-158.png`
- `b2b-cart.png`, `b2b-checkout.png`, `b2b-order-confirmed.png`
