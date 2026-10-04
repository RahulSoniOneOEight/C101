# Session note — 2026-10-04 (e) — B2B catalogue card blank-space fix

## Root cause
The catalogue grid used `SliverGridDelegateWithFixedCrossAxisCount(... mainAxisExtent: 540)`
while the tile it rendered was `TradeProductCard(compact: true)`, whose natural
content is ~340px tall. The card's `Column` has `mainAxisSize.max`, so within the
over-tall 540px cell the extra ~200px collected as blank space **below the last
control**. Contributors:
- **Grid extent (primary):** 540 vs ~340 content.
- **Old tile content:** delivery-location (`fulfilmentNote`) text and large
  full-width Add-to-Cart / RFQ buttons (the compact variant stacked two full-width
  buttons).
- **Width/fl**. home/offers used 330 while the catalogue used 540 — inconsistent.

## Fix
- **One shared tile.** New `widgets/trade_product_tile.dart` (`tradeProductTile`)
  builds the compact `TradeProductCardCompact` and is used by **B2B Home, the
  Catalogue and Trade Offers & Deals**. Removed the old `tradeProductCard`
  helper (and its delivery text + full-width buttons).
- **Tile content (corrected):** single "X% off" badge · compact image ·
  brand + MOQ · 2-line title (fixed line box) · quantity tiers · dealer price +
  MRP (flexible, price weighted) · quantity stepper · compact Cart-Plus ·
  optional compact **RFQ** row. No delivery-location text, no full-width Add.
- **Grid sizing:** `SliverLayoutBuilder` computes the column count from the
  available constraint (4/3/2 → 2 on mobile) and uses one shared
  `kB2bProductCardExtent` sized to the real content. No `IntrinsicHeight`, no
  nested vertical scrolling, no per-screen fixed heights.
- **Dimensions:** cell 540 → **345**; trailing gap below the RFQ row is a
  consistent **18px** (was ~200px).
- **Imagery:** the demo catalogue had **null thumbnails**, so tiles showed
  placeholder icons. Added category thumbnails (`_categoryThumb`) and switched
  the thumb to `BoxFit.contain` with a proportionate area plus loading/error
  builders.
- **Interactions preserved:** image/title → PDP; tier chips → select tier;
  stepper → quantity; Cart-Plus → add to the common cart; RFQ → RFQ journey.
  Controls sit outside the navigation InkWells.

## Files
- `packages/agency_flutter_ui/lib/b2b_v5.dart` — tile content, RFQ, `BoxFit.contain`
  + loading/error, fixed 2-line title, flexible price row, `kB2bProductCardExtent`,
  compact stepper sizing.
- `apps/prototype_app/lib/widgets/trade_product_tile.dart` — new shared builder.
- `apps/prototype_app/lib/screens/b2b_browse_screens.dart` — responsive grid +
  shared tile (removed the old helper/540 extent).
- `apps/prototype_app/lib/screens/b2b_home_screen.dart`, `b2b_offers_screen.dart`
  — shared tile + shared extent.
- `apps/prototype_app/lib/providers/b2b_trade_providers.dart` — category thumbnails.
- `apps/prototype_app/test/b2b_product_card_test.dart` — new responsive guard.

## Validation
- `flutter analyze` clean (app + package).
- `flutter test` — app **69** pass, package **48** pass.
- New `b2b_product_card_test.dart`: no overflow at **320/334/360/390/400/430**,
  and the card ends within **18px** of the last action at every width.
- Emulator (medium_phone/API 36): catalogue screenshot at 411 and at **320dp**
  (`wm size 840x2400`) — badges, contain images, brand/MOQ, 2-line title, tiers,
  dealer price + MRP, stepper, Cart-Plus and the compact RFQ row, with no blank
  space beneath.

## Notes
- Palette, tokens and unrelated screens untouched.
- Thumbnails are demo seed; a 404 falls back to the placeholder icon.
- Flutter-first per request (Penpot not updated this round).
