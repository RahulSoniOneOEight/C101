# Evidence — money units: write-boundary fix and backfill (CHG-084)

- **Date:** 2026-10-26
- **Environment:** staging only; production untouched and unauthorized
- **Lane / mechanism:** C / `migration` (data conversion + Experience API + medusa-api image)
- **Surfaces:** `api-staging`, `ops-staging` dashboard, `buildkart-staging.web.app`

## 1. Defect

Medusa and the Mercur panels treat money columns as **major units** (₹3,990.00). This deployment
wrote **minor units** (399000) into them, so:

- every native admin screen showed 100× (`₹408,900.00` for a ₹4,089 order);
- captures, refunds, outstanding and commission computed on the wrong magnitude;
- Product Studio wrote `rupees × 100` back into `price.amount`.

## 2. Approach

Medusa becomes the major-unit system of record; the Experience API keeps its **minor-unit contract**
for clients by converting at the boundary.

| Change | Where |
|---|---|
| `MEDUSA_MONEY_UNITS` + `medusaToMinor` / `minorToMedusa` | `services/experience-api/src/commerce/money.ts` |
| Offer prices, item subtotal, cart view, completion payload, shipping options | `index.ts`, `offer-composition.ts`, `cart-totals.ts` |
| Product Studio writes `Number(base)` / `Number(tier.amount)` to Medusa; `list_price_minor` and B2B terms stay minor | admin + vendor `studio-form.tsx` |
| Seller-pricing widgets stop dividing Medusa amounts | admin + vendor `offer-pricing.tsx`, admin `seller-activity` |
| Data conversion (791 prices, 158 order lines, 20 payment collections, 158 commission lines, carts, shipping, jsonb totals, fixed promotion) | `services/hosted/scripts/migrate-money-units.sh` |

## 3. Dry run (nothing written)

```
 price                   791  182,599,170 → 1,825,991.70
 cart_line_item          188    2,420,800 →    24,208.00
 order_line_item         158    3,598,800 →    35,988.00
 order_shipping_method   129       19,900 →       199.00
 payment_collection       20    4,862,683 →    48,626.83
 commission_line         158       72,624 →       726.24
```

Applied inside a transaction and rolled back; marker table empty afterwards.

## 4. Apply

| Step | Result |
|---|---|
| Snapshot | `/var/backups/buildkart/buildkart-pre-money-20261026T141137Z.dump` (2.3 MB) |
| First attempt | aborted by a broken output pipe **before any write**; DB verified unchanged (no marker, `max(price) = 182599170`) |
| Second attempt | committed; marker `2026-10-major-units`; row counts as dry-run |
| `MEDUSA_MONEY_UNITS=major` | added to `/etc/buildkart/secrets/experience-api.env` (backup `.bak-money-20261026`) |
| experience-api | recreated, healthy |
| medusa-api (admin panels) | recreated from the new image, healthy |
| proxy | restarted (upstream IPs changed) |
| Rollback tags | `buildkart-hosted-pilot-experience-api:pre-money-20261026`, `buildkart-hosted-pilot-medusa:pre-money-20261026` |

## 5. Verification

| Check | Before | After |
|---|---|---|
| Admin order `#127` item | ₹399,000.00 | **₹3,990.00** |
| Admin order `#127` shipping | ₹9,900.00 | **₹99.00** |
| Admin order `#127` commission | ₹11,970.00 | **₹119.70** |
| Admin order `#127` total | ₹408,900.00 | **₹4,089.00** |
| Admin order `#127` outstanding | ₹408,900.00 | **₹4,089.00** |
| Admin list `#G110`, `#G111` | ₹408,900.00 | **₹4,089.00** |
| Admin list `#G107` | ₹4,862,683.00 | **₹48,626.83** |
| Storefront PDP | ₹3990 | ₹3990 (unchanged) |
| Storefront order cards | ₹4089 | ₹4089 (unchanged) |
| Shipping options API | 99 / 199 (major leaked) | **9900 / 19900 minor** |
| New order after cutover | — | `BK-261026-FFYT55`, group `#G113`, ₹4,089 |
| Console errors (admin, storefront) | — | 0 |

One real gap was caught during verification and fixed before sign-off: `/v1/carts/{id}/shipping-options`
returned Medusa major amounts directly (99 / 199). Commit `0ce55f8` converts them; re-verified as
9900 / 19900.

## 6. Rollback

1. `docker exec -i buildkart-hosted-pilot-postgres-1 pg_restore --clean --if-exists -U buildkart -d buildkart < snapshot`
2. remove `MEDUSA_MONEY_UNITS=major` from the env file
3. `docker compose up -d --no-deps experience-api medusa-api` using the `pre-money-20261026` tags
4. restart the proxy

## 7. Residual

- **Product Studio write path is code-reviewed but not exercised on staging.** It now sends major
  units; the first operator price edit should be watched. A wrong edit is recoverable from the
  snapshot and the price history.
- Tryton reservation (CHG-082 F4) remains untouched: reconciliation still reports
  `RESERVATION_OR_ORDER_MISSING`.
- One abandoned cart (`cart_01M5WA6EEYA90NGANFMNE5C0ZG`) was created while verifying shipping
  options; it is not listed in My Orders (only completed orders are) and holds no order.
- Settlement statements are generated from static fixtures and were empty, so they were unaffected.

## 8. Product Studio round trip (write path)

The Product Studio write path was the highest-risk change, so it was exercised live on staging rather
than left at code review.

| Step | Stored Medusa `price.amount` | Experience API | Storefront | Android app |
|---|---|---|---|---|
| Baseline | 3990 | 399000 minor (?3,990) | ?3990 ? 16% off | ?3990 ? 16% off |
| Save B2C selling = **4111** | **4111** | **411100 minor** (?4,111) | **?4111** ? 13% off | **?4111** ? 13% off |
| Restore to **3990** | **3990** | **399000 minor** | ?3990 ? 16% off | ?3990 ? 16% off |

Product: `1/2in Drive 24 Pcs Socket Set`, SKU `BAUM-237S1-SET-HEX`, offer
`offer_01M59JHN9EP8RGG9MVGEJ33MSS`. The save replaced the offer price row with
`price_01M59JHNB25Z5RD6P78YQFZ6ZD` = `4111` (major), and the restore wrote `3990` back. The catalogue
was left at its original price.

Screenshots: `screenshots/product-studio-4111.png`, `screenshots/storefront-4111.png`,
`screenshots/android-4111.png`, `screenshots/android-restored-3990.png`.

Note: the first read after saving still returned 399000 for a few seconds; that was a read racing the
write, not a defect ? the subsequent read and both clients showed ?4,111.
