# Session note — 2026-10-03 — B2B Home + related journeys (Flutter)

## Inputs addressed
1. Quick Order lists kept = **Seasonal / Kitchen Works / Floor Essentials**.
2. **+ New list** with an icon; **Upload list removed**.
3. New-list journey: create a list, then add products to it as a preset.
4. Buy Again product tiles open the **PDP** (all product tiles clickable).
5. Buy Again **See All → previous orders**, and reorder the **entire** previous order.
6. Buy Again / Trade Offers & Deals / Category swimlane + products are distinct
   **merchandising units** with a background shade.
7. **Load more** → long scroll in the category/catalogue page.
8. Product tile: **one badge only = "X% off"** (no second stock badge).
9. PDP shows **seller details**; one SKU can have **multiple sellers**; best price
   by default with a "View other sellers" comparison.

## Reuse / Modify / New
| # | Component | R/M/N |
|---|---|---|
| 1 | `procurementListsProvider`, home quick-order presets | Modify |
| 2 | `B2BQuickOrderCenterScreen` (one `+ New list` action) | Modify |
| 3 | `_createList` flow (continues into catalogue) | Modify |
| 4 | `BuyAgainCard` (+`onTap`) | Modify |
| 5 | `B2BOrder`(+`B2BOrderLine`), `B2BOrdersScreen`, `addRepeatOrder` | Modify |
| 6 | `MerchandisingUnitCard` | New |
| 7 | `B2BCatalogueScreen` (pagination + auto-append) | Modify |
| 8 | `TradeProductCardCompact`, `TradeProductCard` | Modify |
| 9 | `TradeSupplier` + `TradeProduct.sellers/bestSeller`, `B2BTradePdpScreen` | New/Modify |

## Changes
- `domain/b2b_trade_models.dart` — `B2BOrderLine`, `B2BOrder.lines`, `TradeSupplier`,
  `TradeProduct.sellers`/`bestSeller`/`copyWith`.
- `providers/b2b_trade_providers.dart` — kept list set (3 lists) +
  `quickOrderPresetsProvider`; `_withSellers` attaches 3 seller offers per SKU;
  `addRepeatOrder` now adds the whole order.
- `packages/agency_flutter_ui`:
  - `b2b_v5.dart` — `TradeProductCardCompact` single badge; new
    `MerchandisingUnitCard`.
  - `b2b_trade.dart` — `BuyAgainCard` tappable; `TradeProductCard` single badge.
- `screens/b2b_home_screen.dart` — rewritten: quick-order driven by the 3 lists;
  Buy Again / Trade Offers & Deals / Categories+Products wrapped in
  `MerchandisingUnitCard`; Buy Again tiles → PDP.
- `screens/b2b_quick_order_screen.dart` — `+ New list` (icon), Upload removed,
  create journey continues into the catalogue.
- `screens/b2b_browse_screens.dart` — catalogue pagination (`_pageSize` 6, auto
  append on scroll, Load more, "All N shown"); tile passes no tag.
- `screens/b2b_quote_screens.dart` — PDP is data-driven by route id with a
  "Sold by" best-price seller + "View other sellers (N)" + tier pricing.
- `router/app_router.dart` — PDP receives `productId`.

## Verification
- `flutter analyze` clean (app + package).
- `flutter test` — package **48**, app **42** pass (updated quick-order tests;
  added seller/reorder tests).
- Emulator QA (medium_phone/API 36): B2B home units render as shaded cards;
  Quick order shows Seasonal/Kitchen Works/Floor Essentials and resolves SKUs;
  Buy Again tile opens the PDP; PDP shows Sold by (Best price) + View other
  sellers (2) with alternative prices; catalogue long-scroll loads products 7–10;
  tiles show a single "X% off" badge.

## Assumptions / open
- All three kept lists are buyer-editable (`buyerSaved`).
- Seller offers are deterministic demo data until the marketplace backend lands.
- Penpot was not updated this round (Flutter-first per the request).
