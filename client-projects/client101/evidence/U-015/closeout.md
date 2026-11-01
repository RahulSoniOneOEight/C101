# U-015 / B008 — Smoke product cleanup: closeout

- **Lane / release:** data-only — no code, no image
- **Base:** staging after U-014 (`release-u014-9a3592aea`)
- **Status:** pending execution (runs after the U-014 repair).
- **Scope:** the three allowlisted Smoke products only.

## Allowlist

| Product ID | Title | Before |
|---|---|---|
| `prod_01M5Z1RF0T3R5W1982YJGHF9Q1` | Smoke 134657 | published, ₹999 |
| `prod_01M5Z1VQD77PMVHHY4A283DQRD` | Smoke 241288 | published, ₹999 |
| `prod_01M5Z521VRV7T8SDNTPCZHYKTH` | Smoke 594475 | published, ₹999 |

## Plan executed

1. Check order/cart references (must be 0).
2. Backup tables: `u015_backup_product_20261101`, `u015_backup_variant_20261101`,
   `u015_backup_offer_20261101`, `u015_backup_channel_20261101`.
3. Archive: `status = 'draft'` and detach from sales channels (history retained; no hard delete).
4. Verify absent from the storefront/API, Sumsan still published with repaired options.

## Results (executed 2026-11-01)

| Step | Result |
|---|---|
| Order / cart references | **0 / 0** |
| Backup | 3 products, 3 variants, 3 offers, 3 channel links (`u015_backup_*_20261101`) |
| Archive | `status = 'draft'` for all three; 3 `product_sales_channel` links removed |
| Published count | **263 → 260** |
| Detail API | all three IDs return **404** on `/v1/products/{id}?channel=b2c` |
| Storefront list | the three titles are gone from the composed catalogue |
| Sumsan Fold 7 | still published: 3 variants, ₹1,48,000 / ₹1,50,000 / ₹1,55,000 |

## Residual (outside the allowlist)

Four other Smoke test products are still published and remain in the catalogue:
`Smoke 707433` (`prod_01M5XW5A0ADNY2CQEKQJE9FQ8S`), `Smoke 208869`
(`prod_01M5XXK4DAJPZ3SC60VWTFB0QY`), `Smoke 685854` (`prod_01M5Z1ASJ5VSKNBRFSESFX0HG1`),
`Smoke 712935` (`prod_01M5Z1BPVDB5G4C7PAC1PM3PCG`). They were not in the brief's allowlist, so they were
not touched — a follow-up cleanup needs an explicit allowlist.

## Rollback

```sql
-- products + channel links
insert into product select * from u015_backup_product_20261101
  on conflict (id) do update set status = excluded.status;
insert into product_sales_channel select * from u015_backup_channel_20261101
  on conflict do nothing;
```
Variants and offers were not modified; their backups are kept for reference.
