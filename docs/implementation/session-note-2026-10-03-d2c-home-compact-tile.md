# Session note — 2026-10-03 — D2C Home layout + compact product tile

## Objective
Revise the **D2C (Consumer) Home** to a tighter, on-system merchandising layout:
1. Move **Browse Categories** from the header to directly below the second
   promotional banner (Clearance Sale) and directly above **Recommended for You**.
2. Category selection filters **only** the Recommended-for-You 5+1 grid — never
   Flash Deals, Best Sellers or the banners.
3. Replace the large full-width **Add to Cart** button with a compact
   **Cart-Plus** icon on the shared D2C `ProductCard` (compact + large variants).
4. Keep the 5+1 composition (5 cards + 1 split slot with 2 compact products).
5. Single-select, horizontally scrollable chips (All | Bathroom | Tiles |
   Electrical | Agriculture | Pumps) with empty/fallback state + View More.
6. Validate at 320/334/360/390/400/430 px.

## Reuse / Modify / New mapping (approved)
| Existing | Target | R/M/N |
|---|---|---|
| Penpot B2C large tile (`quick-add` full-width Add) | compact tile + Cart-Plus | Modify |
| Penpot `category-navigation` (after hero) | below secondary banner | Modify |
| Flutter `ProductCard` (`agency_flutter_ui`) | compact-first; large drops full-width Add | Modify |
| Flutter `HomeHeader` | header minus category rail | Modify |
| Flutter `CategoryIconRail`/`CategoryIconItem` | `HomeCategoryFilterBar` (single-select chips) | Modify/New |
| Flutter `ProductCompositionSection` (5+1) | category-filtered | Reuse |
| `SplitMerchandisingTile` / `CompactProductItem` | keep | Reuse |
| `CartPlusIconButton` | reuse in the price row | Reuse |
| Flash/Best carousels | reuse compact `ProductCard` | Reuse |
| — | category→products filter + empty state | New |

## Penpot (design source of truth)
B2C `Home Screen` — `8af5cce6-1485-8016-8008-b49e9f6596eb`
- Reordered the board so **`category-navigation` sits after `secondary-banner`**
  and before `large-feed-head` (rebuilt order by re-appending children —
  `insertChild`/`setParentIndex` proved unreliable for in-place reordering).
- Replaced each `large-tile` `quick-add` (full-width "Add to Cart", 149×27) with
  a `CartPlusIconButton` in the price row (spacer + instance); tiles reduced.
- Added `CartPlusIconButton` to the Flash/Best `deal-card` price rows.
- **Pending (blocked):** export/verify of the updated Home; and the standalone
  **Trade Offers & Deals page** frame (still outstanding from the previous task).
  Blocked because the Penpot plugin tab suspends when backgrounded.

## Flutter (`C:\Users\LENOVO\pincommerce`)
- `packages/agency_flutter_ui/lib/agency_flutter_ui.dart`
  - `ProductCard`: removed the large-variant full-width Add button; `_priceRow`
    now renders price+MRP as one ellipsizing `Text.rich` with a trailing
    `CartPlusIconButton` (compact 32 / large 40); image heights 120/100; badge +
    discount pills share one positioned row so they no longer overlap or
    over-truncate.
  - `TrustBuilderRow` made overflow-safe at 320px (`Flexible` items + ellipsis).
- `apps/prototype_app/lib/widgets/home_header.dart`
  - `HomeHeader` no longer renders the category rail; search text wrapped in
    `Expanded` (ellipsis) for narrow widths.
  - New `HomeCategoryFilterBar` — single-select `TradeFilterChip` row, first chip
    "All" (null selection).
- `apps/prototype_app/lib/providers/catalog_providers.dart`
  - New `HomeCategoryFilter` model + `homeCategoryFilters` + `filterProductsByHomeCategory`.
- `apps/prototype_app/lib/screens/product_list_screen.dart`
  - Rewritten as `ConsumerStatefulWidget`. Renders modules in order, inserting
    the `Browse Categories` section after the Clearance banner; the
    product-composition module is rebuilt with category-filtered products
    (5 + split slot). Empty state ("No <category> products yet" + View More).

## Verification
- `flutter analyze` — clean (app + package).
- `flutter test` — package 48 pass; app 40 pass (incl. new
  `test/d2c_home_layout_test.dart` — no overflow at 320/334/360/390/400/430).
- Emulator QA (medium_phone, API 36): header has no rail; Flash/Best tiles show
  full badge, discount, price + MRP, compact Cart-Plus; Clearance banner →
  Browse Categories (single-select) → Recommended 5+1; Tiles filters to 2
  products; Electrical shows the empty state; carousels/banners unaffected.

## Assumptions / open items
- The home category chip set follows the brief (All + Bathroom/Tiles/Electrical/
  Agriculture/Pumps); the demo catalog has no Electrical/Agriculture/Pumps stock,
  which is what surfaces the empty state.
- Product→category matching is keyword-based until a category API is wired.
- Penpot export verification + the Trade Offers page remain to be finished once
  the Penpot plugin tab is focused.
