# Product type — Studio field now shown on the PDP (2026-11-01)

## What changed

- The Product model reads `metadata.product_type` (the Product Studio “Product type” field).
- The PDP shows it in **Key specifications** as `Type` and in **Full specifications** as
  `Product type`, alongside the existing real fields (brand, category, SKU, seller).
- No API change: the composed product already carried `metadata.product_type`.

## Data set (allowlisted, backup-first)

Backup table: `u022_product_type_backup_20261101` (three rows).

| Product | Product type | Source |
|---|---|---|
| 3M Mirror Mount Tape, Double Side, 5m | **Adhesive Tape** | set in this pass |
| 3-Hole Basin Mixer (Jaquar) | **Basin Mixer** | set in this pass |
| Action Tesa HDHMR Board, Plain, 8' X 4' | **HDHMR Board** | set in this pass |
| IPHONE 17 | **MOBILE PHONES** | already set in Studio |
| Wonder Cement | **Cement** | already set in Studio |

## QC (live)

| Check | Result |
|---|---|
| API exposes `metadata.product_type` | PASS (tape = Adhesive Tape, iPhone = MOBILE PHONES) |
| Tape PDP shows the type | PASS — `Type: Adhesive Tape` / `Product type: Adhesive Tape` |
| IPHONE 17 PDP shows the type | PASS — `MOBILE PHONES` |
| 3-Hole Basin Mixer PDP shows the type | PASS — `Basin Mixer` |
| Products without a type | Row omitted (no empty spec lines) |
| Tests | `composed product exposes the studio product type` added; 315/315 pass |
| Console errors | 0 |

Screenshots: `evidence/qc/screenshots/product_type_tape.png`, `product_type_iphone.png`.

## Rollback

```sql
update product p
   set metadata = b.metadata, updated_at = now()
  from u022_product_type_backup_20261101 b
 where p.id = b.id;
```
