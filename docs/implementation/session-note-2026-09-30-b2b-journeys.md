# Session Note — BuildKart B2B Journeys, Quick Order Center & B2C Tile Polish

> Date: 2026-09-30 · **Penpot file: Client101** (`40e06342-8830-80d6-8008-9a92fdfb6804`)
> Repo: `packages/agency_flutter_ui`, `apps/prototype_app`, `client-projects/client101`
>
> Focus: make the B2B Home a real journey hub (buying, RFQ, lists, catalogue, search) and
> clean up the B2C home tiles. Penpot-first where the journey changed, Flutter to match.

---

## 1. B2C home tile polish (`CHG-010`)

- Removed **rating / review-count / delivery** metadata from B2C home product tiles (only in the
  home mapper — the `ProductCard` API still supports them for other surfaces).
- Moved **trust + discount badges onto the media** (top-left / top-right) instead of adding a
  variable-height badge row; fixed card spacing.
- Restored **“+” quick-add (compact) and “Add to Cart” (large)** buttons on B2C tiles, wired
  end-to-end (`ProductListScreen → HomeScrollFeed → MerchandisingModuleView → card`) into
  `cartProvider.addItem`.
- Repaired the **split merchandising cell** (matches adjacent card height) and made the
  5+1 composition responsive (2 phone / 3 tablet columns). Fixed a compact-card overflow.

## 2. B2B Quick Order Center + procurement lists (`CHG-011`)

- **Penpot:** new `ProcurementListCard` component + `B2B Quick Order Center` (Manual Entry /
  Upload List tabs; Upload Own List → Saved Lists → Suggested Lists).
- **Flutter:** `ProcurementList` / `ProcurementListItem` / `ProcurementListSourceType`
  (backendCurated · buyerSaved · personalized · seasonal · categoryBased) / `ProcurementListAction`.
- `procurementListsProvider` (data-driven, 8 lists — names never hardcoded in UI);
  `ProcurementListCard` widget; `B2BQuickOrderCenterScreen`; `ProcurementListDetailScreen`.
- **List detail is cart-like**: per-item checkbox + quantity stepper → “Add Selected to Order (N)”
  or “Add All to Order” → quotation cart.

## 3. Catalogue / Schemes / Price Advantage (`CHG-012`)

- `TradeProduct` gained `categoryId` + `seasonal`; `tradeCatalogueProvider` (12 category-tagged
  products) powers **category browse**, **Best Deals** (discounted) and **Seasonal** surfaces.
- `B2BCatalogueScreen` (search + category chips + 2/3/4-col grid), `B2BSchemesScreen`,
  `B2BPriceAdvantageScreen` (account summary + tier table).
- **Penpot:** `B2B Catalogue`, `B2B Schemes`, `B2B Price Advantage` built with 0 containment
  violations.

## 4. B2B home journey audit + organization (`CHG-013`)

- Wired previously-dead home actions: **Trade Picks → PDP** (added `onTap` to `TradeProductCard`),
  card **RFQ → `/b2b/rfq`**, **header cart → quotation cart**, **account → account tab**,
  **Quick Order inline steppers + Add to Order**.
- **Quick Order restructure**: removed “Scan Barcode”, added a **search bar** + **“Saved List” /
  “Upload List”** buttons → Quick Order Center (common list journey). **Search results show
  matching products with a “+” to add.**
- Utility cards **“Frequent & Saved” / “My Price Advantage” → expandable collection swimlanes**
  (inline accordion); **lists are Quick Order Center-only** (removed the separate Saved/Suggested
  screens + routes).
- **Penpot:** search bar + “Saved List” on the Quick Order panel; removed the header search bar
  (single search entry); added `B2B Quick Order Search` (results with “+”); removed the redundant
  `B2B Saved Lists` / `B2B Suggested Lists` boards.

## Verification

- `flutter analyze` clean (both packages); `flutter test` green (incl. new B2C tile,
  quick-order, procurement-list, catalogue tests); `flutter build web --release` succeeds.
- Change contracts `CHG-010/011/012/013` + `design-build-CHG-*` evidence validate against their schemas.
- Penpot: new screens pass containment validation (0 overlaps) — except a pre-existing tile
  alignment quirk in the original `B2B Home` (merchandising tiles’ internal content offset).

## Follow-ups

- Re-run the full 34-screen Penpot flow arrangement (Home first, left-to-right by journey) — was
  interrupted by plugin suspensions.
- Remove the Flutter `B2BHeader` search bar to match the now-single-search design.
- Close remaining stubs: Buy Again reorder-to-cart, home-grid “Add” → B2B cart.
- Draw the Penpot accordion “expanded swimlane” example board for the utility cards.
