# Session Note — BuildKart B2B Trade Home & Trade Product Card

> Date: 2026-09-29 · **Penpot file: Client101** (`40e06342-8830-80d6-8008-9a92fdfb6804`)
> Repo: `packages/agency_flutter_ui`, `apps/prototype_app`
>
> Treat the B2B Home as a **trade operations dashboard** composed of Quick Order, Repeat Orders,
> Schemes, Quotations, Catalogue and Trade Picks — not a consumer ecommerce homepage.

Two stages: **Stage 1 Penpot** (design system + composition) then **Stage 2 Flutter** (same component
system). No Flutter work preceded the Penpot structure.

---

## Stage 1 — Penpot (B2B components + home)

Components created under the `B2B` library group (Penpot `B2B / <name>` path convention):

| Component | Notes |
|---|---|
| `B2B / Header` | BK brand, B2B label, search field, cart/account |
| `B2B / Category Rail` | 6 trade categories (icon + label) |
| `B2B / Account Summary` | business name, **[Dealer][GST ✓][11% Trade Disc]** badges, **credit meter**, `₹1.72L Free`, View → |
| `B2B / Quick Order` | Scan Barcode, Upload List, SKU/Qty rows, + Add row, Add to Order |
| `B2B / Repeat Order Card` | order#, value, **item summary**, Reorder → Cart |
| `B2B / Scheme Card` (+ `· Cash Offer`, `· Credit Scheme`) | Free Goods / Cash Offer / Credit badges |
| `B2B / Quotation Row` | RFQ, item summary, quote-count / Pending, View |
| `B2B / Category Tile` | icon + label (catalogue grid) |
| `B2B / Trade Product Card` | full-width: stock, savings, image, brand, MOQ, **tier selector with per-unit price**, trade price vs MRP, total, fulfilment, Add + RFQ |
| `B2B / Trade Product Card · Grid` | **condensed 2-column** variant for Trade Picks |
| `B2B / Bottom Navigation` | Trade / Credit / Orders / Account |

**`B2B Home`** (long-scroll, composed from instances): Header → Category Rail → Account Summary →
Quick Order → Repeat Orders → Schemes → Quotations → Catalogue (2×3) → **"Dealer price · Showing MRP →"**
+ **2-column Trade Picks grid** → Bottom Navigation.
Prototype links: Add → Quotation Cart, RFQ → Create RFQ, Reorder → Cart.

**Tokens:** none added — reused `surface.*`, `content.*`, `action.primary`, `trust`, `promotion`,
`feedback.info`, `border.*`, spacing/radius/type. Note: the reference suggested *teal* as the trade
action colour; governed client101 is **indigo `#5B6EE1`**, which is kept.

## Stage 2 — Flutter

**`packages/agency_flutter_ui/lib/b2b_trade.dart`** (new, `part` of the design system):

- Widgets: `B2BHeader`, `TradeCategoryRail`, `TradeAccountSummary` (credit meter + badges),
  `QuickOrderPanel` + `QuickOrderRow`, `RepeatOrderCard`, `TradeSchemeCard`, `QuotationRow`,
  `TradeCategoryTile`, `TradeQuantityTierSelector`, `TradeProductCard`, `B2BBottomNavigation`.
- Sub-widgets: `StockBadge`, `SavingsBadge`, `TradePriceBlock`, `TradeFulfilmentMeta`.
- Value types: `TradeCategoryItem`, `TradeTierOption`, `TradeSchemeBadge`, `BottomNavItem`.
- States reuse `CommerceFixture` (loading / outOfStock / disabled / resolved=Added); `compact` flag
  drives the 2-column layout. **Tier selection updates unit price, total and the `Add {qty} pcs` label.**

**`apps/prototype_app`**:
- `domain/b2b_trade_models.dart` — `TradeTier`, `TradeScheme`, `B2BOrder`, `TradeProduct`
  (wraps `Product`; D2C `Product` API unchanged). `TradeProduct.unitPriceFor/totalFor` own tier pricing.
- `providers/b2b_trade_providers.dart` — `TradeDashboard` fixture (categories, schemes, repeat orders,
  quotations, trade picks).
- `screens/b2b_home_screen.dart` — `B2BHomeScreen` as `CustomScrollView`/slivers; 2-column `SliverGrid`
  for Trade Picks; credit fraction from `usedCredit/creditLimit`; reuses `b2bAccountProvider`.
- Route **`/b2b`**.
- Preserved: existing models, cart/order logic, RFQ (`quotesProvider`), account/credit — no pricing
  calculations duplicated in widgets.

## Verification

- `flutter analyze` clean on both packages.
- Tests: `agency_flutter_ui` **17 passed** (incl. 7 new B2B widget tests in `test/b2b_trade_test.dart`),
  `prototype_app` **1 passed**.
- Fixed a real overflow in `QuickOrderRow` qty controls (found by the new test).

## Follow-ups

- Wire widget actions (`onAdd`/`onRfq`/reorder/scan/upload) to cart + `quotesProvider`.
- Visual QA Flutter vs Penpot (2-column card density).
- Confirm the production b2b surface (web vs mobile) and the teal-vs-indigo action colour.
