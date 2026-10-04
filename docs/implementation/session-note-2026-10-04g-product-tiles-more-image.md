# Session note — 2026-10-04 (g) — Product tiles: more image, less text

## Input
In the product tiles (both B2C and B2B) give **more area to the image and less to
text**.

## Changes

### B2C `ProductCard` (`packages/agency_flutter_ui/lib/agency_flutter_ui.dart`)
- Image area: **compact 100 → 132**, **large 120 → 172**.
- Title box tightened: **large 38 → 36**, **compact 40 → 34**.
- Dependent heights: `ProductCarousel` 236 → **252**; `ProductGrid` default
  272 → **296**; D2C Home "Browse Categories" grid 250 → **296**; Browse tab
  grid 250 → **296**; Cart "You may also like" rail 240 → **252**; Wishlist tile
  image 110 → **132** and grid 268 → **292**.

### B2B `TradeProductCardCompact` (`packages/agency_flutter_ui/lib/b2b_v5.dart`)
- Image area: **104 → 140**.
- Title box tightened: **34 → 32**.
- Shared grid extent `kB2bProductCardExtent`: **345 → 378** (sized to the new
  content; trailing gap stays ~18px).

### Other B2B product tiles
- `HorizontalSKUCard` (Trade Offers swimlane) image **64 → 84**; Home offers lane
  height 176 → **196**.
- `CompactQuickOrderSkuCard` thumbnail **40 → 48**; quick-order grids 136 → **144**
  (Home) and 200 → **208** (Quick Order Center).

### Imagery (were placeholders)
- The demo catalogues had **null thumbnails**, so the larger image area showed an
  empty placeholder. Added thumbnails to the B2C `demoProducts` (reusing the B2B
  category imagery), so both B2C and B2B tiles now render real images
  (`BoxFit.contain`, loading + error builders).

## Verification
- `flutter analyze` clean (app + package).
- `flutter test` — app **70** pass, package **48** pass, including the responsive
  B2B card guard (no overflow at **320/334/360/390/400/430**, trailing gap <20px)
  and the D2C layout guard (no overflow at 320–430).
- Emulator (medium_phone/API 36):
  - B2C Browse/Home tiles: large image with compact brand + title + price.
  - B2B Catalogue tiles: larger image with badge, brand/MOQ, 2-line title, tiers,
    price + MRP, stepper, Cart-Plus, RFQ — no blank space.
  - D2C PDP shows the real product image.

## Files
- `packages/agency_flutter_ui/lib/agency_flutter_ui.dart`
- `packages/agency_flutter_ui/lib/b2b_v5.dart`
- `packages/agency_flutter_ui/lib/trade_offers.dart`
- `apps/prototype_app/lib/screens/{product_list_screen,d2c_shell,cart_screen,b2c_flow_screens,b2b_home_screen,b2b_quick_order_screen}.dart`
- `apps/prototype_app/lib/providers/catalog_providers.dart`
- `apps/prototype_app/test/d2c_home_layout_test.dart`

## Notes
- Palette, tokens and unrelated screens untouched.
- Thumbnails are demo seed; a 404 falls back to the placeholder icon.
