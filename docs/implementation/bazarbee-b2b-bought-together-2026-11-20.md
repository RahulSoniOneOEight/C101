# B2B Bought Together on the trade PDP — 20 Nov 2026

Status: **implemented on staging** · Web `release-web-20261120-065339` · API
`release-api-20261120-065241` · Source `a83f989`
Production: untouched.

## 1. What changed

- `getBoughtTogether` now accepts the signed-in session token. The trade PDP passes it so the
  Experience API resolves the caller as a trade buyer.
- `optionalAuthorization` now reads the **pilot-access override** before the environment baseline.
  Without this, a tester granted B2B through the access editor was still priced and paired as a
  B2C caller on public product reads.
- The trade PDP renders a **Bought together** section with:
  - the current trade line and price;
  - the paired trade product, price, MOQ and seller;
  - a **View trade product** link to `/trade/pdp/{id}`.
- The section is hidden when there is no active B2B pair, so the PDP remains safe for products
  without merchandising data.

## 2. Staging pair

`btp_bazarbee_b2b_qc`:

| Side | Product | SKU | Trade price |
|---|---|---|---|
| A | Wonder Cement | `WON-PPC-DAN-01` | ₹350 / pc |
| B | Sumsan Fold 7 | `Mob-sumsng-Fold7-Blue` | ₹1,55,000 / pc, MOQ 1 |

Reproducible seed: `services/hosted/scripts/seed-b2b-bought-together.sql`.

The existing B2C pair was left as B2C. An earlier trial that changed the socket-set pair to
`both` was reverted because the paired pendant has no active B2B offer.

## 3. Verification

API with a trade session:

```text
GET /v1/products/prod_01M5Q98Y7CEHEPKZENTNGF9CVW/bought-together?channel=b2b&sku=WON-PPC-DAN-01
→ pair_id btp_bazarbee_b2b_qc
→ channel b2b
→ paired Sumsan Fold 7
→ paired_availability in_stock
→ paired.best_price b2b_configured true, MOQ 1
```

Browser at 1440 px:

```text
/trade/pdp/prod_01M5Q98Y7CEHEPKZENTNGF9CVW
COMPLETE THE JOB
Bought together
This item: Wonder Cement, ₹350
Pair with: Sumsan Fold 7, ₹1,55,000, MOQ 1 · PowerMax Depot
View trade product → /trade/pdp/prod_01M637Y1F4N6AZF9BRC5K7KP6S
```

Screenshot: `b2b-pair-01.png`.

## 4. Remaining

- The B2B pair card links to the paired PDP; it does not yet add the paired line to the quote
  directly from the card.
- Pair authoring remains the admin merchandising API; there is no web admin screen for it.
- The pair is staging demo data and must not be treated as production merchandising.
