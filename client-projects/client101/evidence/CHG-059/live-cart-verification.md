# CHG-059 — live cart verification (staging)

**Date:** 2026-10-19
**Release:** `experience-api` built from commit `608ae93`
**Environment:** `https://api-staging.pinakaplay.cloud`

## Scenario

Signed in as the pilot customer `rsoni001@gmail.com`, created a cart, added one
in-stock offer, attached a complete Indian address, selected the cheapest
shipping option, then read the canonical cart.

| Field | Value |
|---|---|
| Line | Frosted Glass Wall Lamp · `DWL-CHR-MB160275211A` |
| Item amount | ₹3,015.00 |
| Shipping option | ₹99.00 |
| `subtotal` | ₹3,015.00 |
| `item_subtotal` | ₹3,015.00 |
| `engine_subtotal` | ₹3,114.00 |
| `shipping_total` | ₹99.00 |
| `total` | ₹3,114.00 |

Subtotal + shipping = total. The old behaviour would have shown
Subtotal ₹3,114 + Shipping ₹99 = Total ₹3,114.

## Promotion

Applied `ORDER5` to the same cart:

| Field | Value |
|---|---|
| Applied | `ORDER5` |
| Rejected | none |
| `subtotal` / `item_subtotal` | ₹3,015.00 (unchanged) |
| `discount_total` | ₹150.75 |
| `shipping_total` | ₹99.00 |
| `total` | ₹2,963.25 |

The item subtotal did not move; the discount stayed a separate authoritative
field. 3,015.00 − 150.75 + 99.00 = 2,963.25.

## Cart line image (CHG-061)

The same response carried:

- `thumbnail`: `https://ops-staging.pinakaplay.cloud/static/jaquar-frosted-glass-wall-lamp.png`
- `product_id`: `prod_01_...`

So the cart can resolve its image directly, without the title fallback.

## Not performed

No order was completed. The verification cart remains an abandoned staging cart;
no payment, fulfilment or notification was triggered.

Staging only; production release remains unauthorized.
