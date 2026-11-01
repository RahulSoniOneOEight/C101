# Product-type backfill — 70 products (2026-11-02)

Staging data change. No app or API release; the live web stays `68f5125`.

## 1. What was written

`product.metadata.product_type` for **70 published products**, derived from the
governed import taxonomy `metadata.category_l2` — never from titles or guesses.
Every row also carries `product_type_source = u025_backfill_20261102`.

| Product type | Products |
|---|---|
| Basin Mixer & Tap | 15 |
| Plywood & Board | 9 |
| Waterproofing | 8 |
| Adhesive | 5 |
| Tile Adhesive | 5 |
| Cement | 4 |
| Paint | 4 |
| Building Material | 4 |
| Mobile Phone | 3 |
| Switch & Socket | 3 |
| WC & Flushing | 3 |
| Bulb | 2 |
| Pipe & Tank | 2 |
| Wash Basin | 2 |
| Wall Putty | 1 |
| **Total** | **70** |

Five legacy values were normalised into the same vocabulary:
`Phone` / `Mobile` / `MOBILE PHONES` → **Mobile Phone**; `Basin Mixer` →
**Basin Mixer & Tap**; `Colour & Parts` (Asian Wall Putty) → **Wall Putty**.

**Catalogue coverage: 12 → 77 of 244 products (32%).**

## 2. Backups and rollback

| Backup | Rows | Contents |
|---|---|---|
| `u025_product_type_backup_20261102` | 70 | `id, metadata` before the change |
| `u025_product_type_normalise_backup_20261102` | 5 | the five normalised rows |

Rollback:

```sql
update product p
set metadata = b.metadata
from u025_product_type_backup_20261102 b
where p.id = b.id;
```

The repeatable script is committed at
`services/hosted/scripts/u025-product-type-backfill.sql` (idempotent: it keeps
the first backup and only updates rows without `product_type_source`).

## 3. Verification

| Check | Result |
|---|---|
| DB rows with `product_type_source = u025_backfill_20261102` | **70** | PASS |
| Backup table row count | **70** | PASS |
| Re-running the script | `UPDATE 0`, backup unchanged | PASS |
| API `/v1/products` | 77 typed products; 15 new types with the counts above | PASS |
| Browse filter sheet | `Plywood & Board (9)`, `Waterproofing (8)`, `Cement (5)`, `Tile Adhesive (5)`, `Switch & Socket (3)`, `Basin Mixer & Tap (15)` | PASS |
| Filter apply | `Plywood & Board` → **9 results**, filter count 1 | PASS |
| PDP | Action Tesa MDF key specs: `Type  Plywood & Board` | PASS |
| B2B catalogue sheet | still renders Product type, no regression | PASS |
| Console / page errors | 0 (B2C and B2B sessions) | PASS |

Screenshots: `u025_product_types_sheet.png`, `u025_product_types_applied.png`,
`u025_b2b_sheet.png`.

## 4. Still open

- **167 products remain untyped** — mainly tools (sockets, pliers, hand tools,
  spanners, hammers), lighting (pendants, chandeliers, wall lights) and seeds.
  The same `category_l2` rule can cover them in the next batch.
- **Test products keep junk types**: `Pipe` (3 × QC Import) and
  `QC auto publish` (1). They should be archived with the QC-product cleanup,
  not typed.
- **Type values from different sources** still coexist by design: `HDHMR Board`
  and `Adhesive Tape` are more specific than their leaf, and that is correct.
