# U-019 / U-021 — Browse sort + filter redesign: implementation plan

**Status:** WIP parked on `feat/u019-browse-facets` (pushed). Not deployed.
**Base:** `feat/u009-pincode-delivery` @ `71421f2`
**Lane:** A for the facet UI; **B** once ETA / seller-location data lands.

## 1. What the diagram asks for

Browse: sticky control bar (48 px), removable filter chips, 2-up 0.64 tiles with a delivery speed
line; Sort sheet (Relevance, Price ↑, Price ↓, Discount, Newest; Popularity/Rating hidden); Filter sheet
with Category tree + counts, price slider + presets + min/max, searchable Brand, Seller multi-select,
Delivery (pincode check + **Fast delivery only ≤3 days**), **Seller location** (states + “No location
on file”), Availability, and a Reset / “Show N results” footer.

## 2. What is already implemented in the WIP branch

| Item | State |
|---|---|
| Sort: Relevance, Price ↑, Price ↓, **Discount**; Rating removed | done |
| Category facet with live counts (rail categories + Uncategorised) | done |
| Brand facet with counts | done |
| Seller facet with counts (derived from variant `seller_name`) | done |
| Availability facet (In stock / On discount) with counts | done |
| Removable active-filter chips + clear-all (backspace icon) | done |
| Reset / “Show N results” footer wired to the new state | done |
| Tests: sort chips updated, facet count assertions | updated |

Known gap in the WIP: the price facet is still preset ranges (no dual slider), brand is not searchable,
and the chips row sits under an unpinned control bar.

## 3. What remains

### Phase 1 — no new data (finish in the WIP branch)

1. Price: dual `RangeSlider` over the catalogue min/max + presets + min/max inputs.
2. Brand: search field inside the facet (filter the counted list).
3. Control bar: decision needed — the diagram wants **sticky 48 px**. U‑011 removed pinning to reclaim
   102 px. Recommended: a compact single-row sticky bar (44–48 px) with Sort · Filters · count, and keep
   the quick-filter chips in the scrolling content.
4. Chips row styling to the diagram (category/seller/price chips with ×).
5. B2B: same facet shell with trade-specific facets (MOQ, GST invoice, credit, rate band) — not
   pincode/location unless the trade site pincode applies.

### Phase 2 — needs API/data

| Field | Consumer | Owner |
|---|---|---|
| `eta_max_days` on the composed product | Fast-delivery toggle, tile speed line, hidden-when-empty rule | experience-api + Medusa offer/metadata |
| `seller_location.state_name` | Seller location facet + “No location on file” bucket | seller metadata (B010 + 6 rows) |
| pincode serviceability read for a PDP/browse scope | “Delivers to” check | delivery-rates module |
| `created_at` | Newest sort | composed product |
| real list price (`mrpIsReal`) | Discount sort (already available client-side) | existing |

Per the diagram, the delivery and location sections must be **hidden** until the data exists — no empty
facets, no fake counts.

## 4. Acceptance criteria (draft)

- R1 Sort offers exactly the data-backed options; Rating/Popularity absent.
- R2 Every facet shows a count matching the results it yields (within the current category/search scope).
- R3 Active facets appear as removable chips; clear-all resets every facet but keeps the sort.
- R4 Delivery/location sections hidden when no product carries ETA/location.
- R5 Fast-delivery toggle filters to `eta_max_days <= 3` and excludes products without a promise.
- R6 B2C and B2B each use their own facet set; B2B goldens unchanged.
- R7 `flutter analyze` clean, tests pass, no console errors, screenshots at 360/390/414.

## 5. Verification plan

- Widget tests for each facet (counts, toggling, chips, reset).
- Geometry/regression: control bar height, first-tile offset, sticky behaviour.
- Live QC: apply two facets, remove one chip, reset, confirm counts and result totals.
- B2B: apply MOQ/rate facets, confirm the quotation cart is unaffected.

## 6. Risks

- Category counts are computed client-side over the loaded catalogue; with pagination the numbers can
  drift from the server total. Phase 2 should return server facet counts.
- Making the bar sticky reverses part of U‑011 P0‑4; the 48 px compact bar is the compromise.
- Seller counts depend on `seller_name` in the composed payload; a seller with no name is invisible.
