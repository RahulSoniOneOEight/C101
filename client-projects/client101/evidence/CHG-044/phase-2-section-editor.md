# CHG-044 Phase 2 — Storefront Layout Section Editor

**Date:** 17 October 2026
**Commits:** `f6e3f5d` (editor) · deployed as `f6e3f5d`
**Status:** Deployed to staging; editor verified by build, bundle and a write-path round trip. No browser click-through.

## What phase 2 delivers

The layouts listing previously sent an operator to the raw JSON property page. Each layout now opens a
**section editor** at `/merchandising/storefront-layouts/{documentId}`:

- **Ordered section list**, one card per section, with the order number and **move up / move down**.
- **Add a section**, offering only the placements that belong to that layout's channel, so a B2C layout
  cannot be given a B2B section.
- **Per-section fields**: display title, subtitle, badge, product source, collection, products-to-show,
  See All label and destination, banner association (only where the placement accepts one), start and
  end time, and a show/hide switch.
- **Group children**: `Trade Offers & Deals` configures Seasonal, Best Deals and Schemes inside it, in
  declared order, because the storefront renders them as tabs.
- **Validation with the same rules delivery applies**, shown before saving: Save draft and Save and
  publish are both blocked while there are errors, and non-blocking issues (a banner on a placement that
  does not accept one) appear as warnings. This is what prevents the "publish and nothing happens"
  failure mode.
- Optimistic concurrency via `expectedUpdatedAt`, so a stale editor cannot overwrite newer work.

The collection picker reuses the **existing** `admin.collections` route in the typed client — no new
endpoint was added.

## The registry is now enforced on both sides

`layout-section-model.ts` mirrors the delivery registry, and `tooling/validate_layout_sections.py`
compares them on placement, label, channel, source, `acceptsBanner` and declared children. It is wired
into Contract validation and was **proven to fail** on a deliberately diverged copy (`buy_again` changed
to a collection source) before being relied on.

## Verification — write path proven end to end

Staging had **zero Medusa collections**, so the picker had nothing to offer. One was created
(`Flash Deals`, `pcol_01M535V0776WS7MDF0BCVFG9F9`) and the editor's write path was then exercised
through the operator API:

| Step | Result |
|---|---|
| Author 4 sections, one deliberately invalid (`buy_again` on a B2C layout) | stored |
| Publish the layout | published |
| `GET /v1/content/app-shell?channel=b2c` | **3 sections served, in stored order** |

```
flash_deals   | Flash Deals          | badge=Up to 60% OFF | limit=8  | visible=true
best_sellers  | Best Sellers         | badge=Most Loved    | limit=10 | visible=true
recommended   | Recommended for You  | badge=-             | limit=6  | visible=true
sections=3 modules=5
```

Labels, badges and limits survived the round trip; stored order was preserved (not re-sorted); the
channel-invalid section was rejected rather than rendered; and `modules` is untouched as the recovery
format.

## Honest limitations

1. **No browser click-through.** The editor is verified by lint, build, bundle contents and the write
   path — not by a human operating it. The move buttons, the collection picker and the group child
   editing have not been clicked.
2. **Nothing changes on the storefront yet.** Sections are stored and delivered, but the storefront
   still renders the `modules` it always did. **This is phase 3**, and until it lands the section editor
   configures something no customer sees.
3. **Ordering is move up/down, not drag-and-drop.** Accessible and keyboard-friendly, but the brief asked
   for drag-and-drop; that remains to be added.
4. **The raw JSON property page still has no validation.** Only the new editor guards. Someone using the
   advanced JSON view can still store sections that delivery will reject.
5. **Staging test content created:** one Medusa collection (`Flash Deals`) and three sections on the B2C
   layout. Both are editable; the console exposes no delete for sections beyond removing them from the
   layout.
6. **The `collection` source is Medusa**, per Option A. The existing layout `modules` still reference the
   CMS `curated-collection`, so the two coexist until phase 3 reconciles them.
