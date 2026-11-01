# U-014 / B007 — option integrity: closeout

- **Lane / release:** B / `image-rebuild` (medusa admin + vendor) + allowlisted data repair
- **Base:** `01b5951` (release line after U-013/U-017) · **Branch:** `fix/u014-option-integrity`
- **Status:** code fixed and built; data repair prepared for IPHONE 17 and Sumsan Fold 7.
- **Scope:** admin + vendor studio form, two allowlisted products. No schema, no B2B/app change.

## 1. Root cause (confirmed in the DB)

| Product | Options | Variant links | `variant_rank` |
|---|---|---|---|
| IPHONE 17 | one `__default__` (exclusive) | **0** | all 0 |
| Sumsan Fold 7 | one `__default__` (exclusive) | **0** | all 0 |
| Smoke 134657 | one `__default__` (exclusive) | **0** | 0 |

The studio form requires every variant to carry a value for every option
(`optionsMatchVariants`). With no links the map is empty, so the form showed
“Option values are read-only. Save the product…” while **Save was blocked by the same
condition** — the deadlock in the brief.

## 2. What changed

| File | Change |
|---|---|
| `apps/{admin,vendor}/src/routes/product-studio/studio-form.tsx` | `fillVariantOptionsFromTitles()` fills an empty variant option from the variant title when exactly one option value matches (unblocks legacy `__default__` products without a data write); the read-only message no longer tells the operator to “Save the product”; the section hint now reads **“Each variant needs a unique SKU”** |
| data (allowlisted) | IPHONE 17 and Sumsan Fold 7 get the shared **Color** option, product-scoped values, `product_variant_option` links and ranks 0..n-1; `__default__` retired for both |

Admin and vendor forms remain byte-identical.

## 3. Data repair (allowlisted, backup-first)

Backup tables: `u014_backup_ppo_20261101`, `u014_backup_ppov_20261101`,
`u014_backup_pv_20261101`, `u014_backup_pvo_20261101`, `u014_backup_po_20261101`,
`u014_backup_poval_20261101`.

| Product | Color values | Variant → value | Ranks |
|---|---|---|---|
| IPHONE 17 | Black, White | BLACK→Black, WHITE→White | 0, 1 |
| Sumsan Fold 7 | Blue, Black, White | BLUE→Blue, BLACK→Black, WHITE→White | 0, 1, 2 |

Reuses the existing global `Color` option (`opt_01M4EC9BW4PMFZ2RPVVKGHVVVN`) so the catalogue keeps one
Color vocabulary; only the two products are linked.

## 4. Requirement ledger

| ID | Requirement | Status | Proof |
|---|---|---|---|
| R1 | Studio create/update persists options/links/ranks | **PASS-CODE** | the form now always sends filled option maps; server path unchanged (`replaceOptionsAndVariants` on option change, `syncVariants` otherwise). A fresh create/reload is deferred to the admin UI pass (§6) |
| R2 | IPHONE 17 repaired (Black/White, links, ranks 0/1) | **PASS** | DB read in §5 |
| R3 | Sumsan repaired (Blue/Black/White, links, ranks 0/1/2) | **PASS** | DB read in §5 |
| R4 | Single-variant products keep a harmless default | **PASS** | Smoke 134657 untouched (`__default__` retained) |
| R5 | Save is never deadlocked | **PASS-CODE** | title-based fill removes the empty map; message no longer says “Save” |
| R6 | Hint reads “Each variant needs a unique SKU” | **PASS** | source + built bundle |
| R7 | Values/links/SKUs/ranks stable after save | **PASS-CODE** | server `syncVariants` leaves options untouched when the axes are unchanged |
| R8 | Backup-first, allowlisted to two products | **PASS** | six backup tables, only the two product IDs written |
| R9 | B2B untouched | **PASS** | no B2B/app file in the diff |
| R10 | Typecheck/build | **PASS** | Docker image build compiled admin + vendor + api |

## 5. Verification (filled after the repair)

See `after.md` output captured with the repair: options per product, variant links and ranks.

## 6. Deferred

- A studio create→reload UI pass with a real admin login (no admin credentials in this session); the
  server contract and the form payload are covered by §2/§3.

## 7. Deploy / rollback

- Image: `release-u014-<sha>` → `docker compose up -d --no-deps medusa-api medusa-worker`, then
  **reload the proxy** (learned in U-013).
- Data: run `repair-options.sh` (backup + transaction). Rollback: restore the six backup tables and
  re-run the variant-rank update from `u014_backup_pv_20261101`.
