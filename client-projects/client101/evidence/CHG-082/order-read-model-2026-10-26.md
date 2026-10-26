# Evidence — order read model truth and payment copy (CHG-082)

- **Date:** 2026-10-26
- **Environment:** staging only; production untouched and unauthorized
- **Lane / mechanism:** B / `image-rebuild` (static app bundle + Experience API image)
- **Surfaces:** `https://buildkart-staging.web.app`, `https://api-staging.pinakaplay.cloud`, `https://ops-staging.pinakaplay.cloud/dashboard/`

## 1. Defects addressed

| ID | Defect (from the 2026-10-26 order review) | Resolution |
|---|---|---|
| F2 | Confirmation claimed "Payment confirmed · GST invoice will be issued" while the adapter only authorizes | Copy now reads "Simulated payment authorized · no real charge" |
| F3 | Customer order reference was the internal cart id (`BK-cart_01M5…`) | `/v1/me/orders` and `/v1/orders/{id}` return a deterministic `order_number`; the app renders it |
| F5 | Order card and payment summary derived totals from lines, and shipping was hardcoded "Free" | Completion stores currency/subtotal/shipping/discount/total; reads expose them; the UI renders the server total |
| — | `/v1/me/orders` listed in-flight carts as blank "0 items" orders | Reads filter to rows with a canonical order group |

F1 (admin money scaling) and F4 (Tryton reservation) remain deferred by the requester.

## 2. Design

- **Order reference:** `BK-<YYMMDD>-<6 Crockford chars of sha256(order_group_id)>`, computed on read.
  Deterministic, stable across retries, non-enumerable, no schema change, and re-derivable for legacy
  rows. Matching the merchant number (`#G111/#128`) still requires Mercur to expose `display_id`.
- **Money:** stored once at completion in the API's minor-unit convention
  (`currency_code`, `amounts{subtotal, shipping, discount, total}`), with `customer_reference`
  alongside. Legacy rows keep working: total from the stored group, null line components.
- **No storage-unit change:** this does not touch the paise-in-Medusa problem (F1); it stores what the
  cart reports and converts nothing.

## 3. Releases

| Item | Value |
|---|---|
| App commit | `76e1063` |
| App bundle | 3,917,482 bytes, SHA-256 `9f160722…c893797` |
| App rollback channel | `pre-orders-20261026` (serves previous `8150e0e`) |
| API commit | `9868236` |
| API image | `buildkart-hosted-pilot-experience-api:latest` (previous tagged `pre-orders-20261026`) |
| API release dir | `/opt/buildkart-releases/release-9868236` |
| Proxy | restarted after the container recreate (upstream IP change) |

Deployment was scoped: `docker compose build experience-api` + `up -d --no-deps experience-api`. No
other container was recreated, no migration ran, and no catalogue or pricing data changed.

## 4. Verification

Static/bundle gates:

| Check | Result |
|---|---|
| `flutter analyze` | PASS — no issues |
| `flutter test` | PASS — 283/283 (2 new order-model tests) |
| `tsc --noEmit` (Experience API) | PASS |
| Live bundle hash | PASS — matches the built artifact exactly |
| Console errors (orders list, detail, checkout pages) | 0 |
| Failed requests | 0 |

Runtime, buyer screens:

| Check | Result |
|---|---|
| Confirmation copy | `Simulated payment authorized · no real charge` |
| My Orders list | `BK-261026-RHMF98` · ₹4089 · no `cart_…` references · no zero-item cards |
| Order detail (`#127`, legacy row) | Items ₹4089, Order total ₹4089 (no invented shipping row) |
| Order detail (new order) | `BK-261026-DBNYWC` · Items ₹3990 · Shipping ₹99 · Order total ₹4089 |

Runtime, API:

| Check | Result |
|---|---|
| `/v1/me/orders` | 5 items, all with `medusa_order_group_id`; no in-flight carts |
| New completion read model | `subtotal_minor 399000`, `shipping_minor 9900`, `discount_minor 0`, `total_minor 408900`, `INR` |
| Legacy read model (`#127`) | `total_minor 408900`, subtotal/shipping `null` (expected) |

Admin cross-check for the new order: group `#G111`, order `#128`, BuildMaster Supplies, `authorized`,
`not_fulfilled`, total `408900`. Admin still renders that as `₹408,900.00` — the deferred F1 defect.

## 5. Test orders

| Order | Group | Cart | Purpose |
|---|---|---|---|
| `#127` | `og_01M5VWW4KMVYZ4HMEE6V24ZSBC` | `cart_01M5VWD5Q156Y5BQ6CX8H4TRTS` | Original UI order; legacy-payload verification |
| `#128` | `og_01M5VZ85XC5VJNFNX5CGDTK281` | `cart_01M5VZ81NPK7QPXM90JY5ANG3C` | New-payload verification through the same completion endpoint |

Both are retained: `test_data=true`, uncaptured, unfulfilled, undeleted.

## 6. Rollback

- App: `firebase hosting:clone buildkart-staging:pre-orders-20261026 buildkart-staging:live --project buildkart-staging`
  (verified serving `8150e0e` before this deploy).
- API: retag `buildkart-hosted-pilot-experience-api:pre-orders-20261026` to `:latest`, then
  `docker compose -f docker-compose.hosted.yml up -d --no-deps experience-api` from
  `/opt/buildkart-releases/release-76e1063/services/hosted`, then restart the proxy.
- Data: no rollback required. The added payload keys are additive; older rows ignore them.

## 7. Residual notes

- Admin money scaling (F1) still shows orders at 100×; this bundle intentionally did not touch units.
- Tryton reservation (F4) still absent, so reconciliation continues to report
  `RESERVATION_OR_ORDER_MISSING`.
- The customer reference differs from the merchant `#G111/#128` until Mercur exposes display ids.
- `/opt/buildkart-releases/current` pointed at `release-0e64bd3` while containers ran from
  `release-711f05e`; this release used its own pinned directory and did not modify the symlink.
