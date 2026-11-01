# B2B card images — why some cards show a placeholder (2026-11-01)

## Finding

The B2B catalogue returns 14 products. The card widget renders images whenever the product has a
`thumbnail`; the grey icon is the designed fallback for a missing one.

| Thumbnail state | Count | Examples |
|---|---|---|
| Valid image URL (renders) | 5 | 1/2in Drive Socket Set, Wonder Cement, QC CHG-086, QC Studio 127088, QC CSV 127088 |
| **No thumbnail at all** | **8** | CHG-086 Journey, QC Import ×3, Smoke 707433 / 208869 / 685854 / 712935 |
| Page URL instead of an image | 1 (Sumsan Fold 7) | `https://www.pexels.com/photo/…` → fixed |

So it is **missing catalogue data**, not a rendering defect: the two real trade products
(socket set, Wonder Cement) always showed their images — the screenshot of the catalogue shows them
correctly next to a blank QC card.

## Fixed now

- **Sumsan Fold 7** thumbnail was a Pexels *photo page* URL, which can never render in an `<img>`.
  Replaced with the direct image URL (`images.pexels.com/photos/12736390/…jpeg`, verified 200).
  Backup: `u023_product_thumb_backup_20261101`.

## Still blank (needs a decision)

Eight published **test/QC records** have no image:

`CHG-086 Journey 596300`, `QC Import 113509`, `QC Import 115833`, `QC Import 125355`,
`Smoke 707433`, `Smoke 208869`, `Smoke 685854`, `Smoke 712935`.

They are leftovers from earlier QC runs (same family as the three archived Smoke products). Two options:

1. **Archive them** (recommended) — status `draft`, detach from channels, backup first. The B2B and B2C
   catalogues then contain only products with images.
2. **Give them representative images** — faster, but they are test records and the images would not be
   the real product.

Archiving needs an explicit allowlist (the U-015 brief forbade bulk operations), so it is not done
without a go-ahead.

## Note on hotlinked thumbnails

Some imported B2C products use `encrypted-tbn*.gstatic.com` (Google Shopping) URLs; those are
hotlink-protected and fail in the browser. Hosting those images on `ops-staging.pinakaplay.cloud`
(or replacing them with real photos) fixes that class too.
