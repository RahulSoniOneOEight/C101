# B2B price-unit correction — 19 Nov 2026

## Symptom

A B2B web checkout displayed a trade line of 5 × ₹3,990 (₹19,950) but completed as **₹283.77**.
The order snapshot showed `unit_price: 3890` minor and `subtotal_minor: 19450` — 100× lower than
the composed B2B offer's ₹3,990.

## Root cause

Two `BuildKart B2B Studio` price lists had six price rows stored in **major rupees** at 1/100th of
the intended value:

| Offer | Quantity | Stored | Intended |
|---|---|---|---|
| `offer_01M59JHN9ECDEA5NEGH8996X6T` | base | 39.90 | 3,990.00 |
| `offer_01M59JHN9ECDEA5NEGH8996X6T` | 5 | 38.90 | 3,890.00 |
| `offer_01M59JHN9ECDEA5NEGH8996X6T` | 10 | 37.90 | 3,790.00 |
| `offer_01M5KW9MDN2N9HQ22WD4MZXQY5` | base | 9.00 | 900.00 |
| `offer_01M5KW9MDN2N9HQ22WD4MZXQY5` | 10 | 8.50 | 850.00 |
| `offer_01M5KW9MDN2N9HQ22WD4MZXQY5` | 20 | 8.00 | 800.00 |

The storefront's composed product payload reads the Product Studio snapshot
(`metadata.buildkart_b2b_pricing`) and showed the intended minor-unit price. Medusa's cart line,
however, prices from the price-list row, so the checkout total diverged from the catalogue.

## Correction

Applied to staging on 19 Nov 2026:

```sql
begin;
update price p
set amount = p.amount * 100,
    updated_at = now()
from price_list pl
where p.price_list_id = pl.id
  and pl.title like 'BuildKart B2B Studio%'
  and p.amount < 100;
commit;
```

Result: `UPDATE 6`. The socket-set price list now reads 3,990 / 3,890 / 3,790.

This is a staging data correction. The production fix must reconcile the price lists from the
Product Studio snapshots and add a completion-time check that the Medusa line price equals the
composed B2B price before an order is accepted. The read-only audit is committed at
`services/experience-api/src/scripts/audit-b2b-price-units.sql`.

## Verification

| Check | Result |
|---|---|
| Cart line after correction | `unit_price: 389000` minor, `subtotal: 1945000` minor |
| Quote at MOQ 5 | Subtotal ₹19,450; automatic offer −₹972.50; delivery ₹99; total ₹18,576.50 |
| Completed B2B order | `BK-261119-PTPF1G`, total ₹18,576.50 |
| Order channel | Cart metadata `channel=b2b`, `business_account_id=business_arjun_traders` |
| B2C control | `BK-261119-KCQJ60`, ₹3,889.50, cart metadata `channel=b2c` |

The earlier B2B order `BK-261119-MAM41J` (₹283.77) was created before this correction and is **not**
accepted as B2B acceptance evidence.
