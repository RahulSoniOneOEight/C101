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

---

## Resolution (2026-11-01)

The eight test/QC records were archived after an explicit go-ahead:

| Product | Status before → after |
|---|---|
| CHG-086 Journey 596300 | published → **draft** |
| QC Import 113509 / 115833 / 125355 | published → **draft** |
| Smoke 707433 / 208869 / 685854 / 712935 | published → **draft** |

- Order/cart references: **0 / 0** before the change.
- Backups: `u024_backup_product_20261101`, `u024_backup_variant_20261101`,
  `u024_backup_offer_20261101`, `u024_backup_channel_20261101` (8 / 8 / 8 / 10 rows).
- Channel links removed for the eight; published count **260 → 252**.

### Result

- B2B catalogue: **14 → 6 products**, and **0 of 6 missing a thumbnail**.
- Sumsan Fold 7 thumbnail fixed from a Pexels page URL to the direct image URL (backup
  `u023_product_thumb_backup_20261101`).
- B2B catalogue screenshot: `evidence/qc/screenshots/b2b_catalogue_after.png`.

## Full-flow QC after the change

| Check | Result |
|---|---|
| B2C browse: Discount sort, no Rating sort, no Smoke products | PASS |
| B2C PDP: ₹432, type “Adhesive Tape”, Discuss | PASS |
| B2C cart: ₹99 delivery, Continue checkout | PASS |
| B2C checkout: total + Place order | PASS |
| **B2C order** | **BK-261101-GE0K30** |
| B2B catalogue: 6 results, no Smoke/QC records, all images | PASS |
| B2B cart + checkout: ₹350, Place Business Order | PASS |
| **B2B order** | **og_01M6BPD2Z90N88SKNRNEE8TVJE** · total **₹431.50** |
| Console/page errors | 0 |
