# B2B Home V5 — screen cleanup + Flutter update (2026-10-02, session 3)

Continues `session-note-2026-10-02-b2b-home-v5-indigo-continued.md`.

## Penpot cleanup (approved: remove deprecated + placeholder stubs)
Removed **35** stale boards from page `Screens` (verified 0 instances first):

- **Deprecated screens:** `B2B Home (deprecated)`, `B2B Home — Collection Expanded`
- **Stray artifact:** `content-spacer` (1×1)
- **32 placeholder stub components** (220×80, only `title`/`variant` text, all unused):
  `Form` (Stacked/Dense) · `Filters` (Chips/BottomSheet/Sidebar/Popover) ·
  `DataTable` (Compact/Operational/Full) · `Chart` (Line/Bar/Area/Donut) ·
  `Carousel` (Product/Banner/Gallery) · `ProductGrid` (Phone2/Tablet3/Desktop4/Wide5) ·
  `MasonryGrid` (Mobile/Desktop) · `Toast` (Success/Error/Warning/Info) ·
  `Tabs` (MobileSegmented/DesktopTabs) · `Dialog` (Modal/Sheet) ·
  `DateTime` (MobilePicker/DesktopCalendar)

Kept: canonical `B2B Home`, `B2B Quick Order Center`, `ProcurementListsPage`,
`B2B Home — …` V5 screens, `Add to Cart — States`.

> ⚠️ **Registry impact (RESOLVED):** `experience/design/ui-implementation-registry.yaml`
> mapped semantic ids to the removed placeholder components. Each affected `penpot` block
> (`commerce.form`, `commerce.filters`, `data.table`, `analytics.chart`, `layout.carousel`,
> `layout.standard-grid`, `layout.masonry`, `feedback.toast`, `navigation.tabs`,
> `overlay.dialog`, `input.date-time`) is now annotated `status: removed-in-penpot`.
> Validated: `python -m tooling.contracts.validator ui-implementation-registry …` → valid.

Missing-component build was **skipped** (per decision) — raw-shape B2B screens stay as-is.

## Flutter update (approved: update B2B Home V5)
Repo: `C:\Users\LENOVO\pincommerce`.

**New UI package file** `packages/agency_flutter_ui/lib/b2b_v5.dart` (part of the library):
| Widget | States / notes |
|---|---|
| `CartPlusIconButton` | `CartPlusState = normal/loading/added/unavailable/error`, 44px, ≥44 target |
| `QuantityStepper` | `− value +`, `compact` variant (32h) for cards |
| `TradeFilterChip` | selected (indigo + ✓) / unselected |
| `ProcurementListFilterBar` | horizontal scroll of `TradeFilterChip` |
| `CompactQuickOrderSkuCard` | thumb, name, SKU, price, stepper, cart-plus |
| `TradeProductCardCompact` | media + stock/savings pills, brand/MOQ, 2-line title, qty tier chips, dealer price, stepper + cart-plus (no delivery / repeated unit price / big Add) |

Wired into `agency_flutter_ui.dart` via `part 'b2b_v5.dart';`.

**Rewrote** `apps/prototype_app/lib/screens/b2b_home_screen.dart` to the canonical V5 Home:
header → quick order (`ProcurementListFilterBar` + 2-up `CompactQuickOrderSkuCard` grid +
View More + Add to Order) → Buy Again → **Trade Offers & Deals** → categories →
**Products** (`TradeProductCardCompact` 2-up) → cart summary → bottom nav.
Dropped the old utility cards / SKU-row QuickOrderPanel. Tile tints use named consts
(`_trustSubtle`, `_promotionSubtle`) mirroring the Penpot subtle-surface tokens.

**Tests / checks**
- `flutter analyze` clean (package **and** app).
- UI package tests: 22 pass (+ **7 new** in `test/b2b_v5_test.dart`).
- App tests: 21 pass (incl. `b2b_layout_overflow_test` — fixed a 9px quick-order grid overflow, extent 120→136).
- `flutter build web --release` → `√ Built build\web`.

## Follow-ups
1. ~~Update `ui-implementation-registry.yaml` for the removed Penpot placeholder components.~~ **Done** — 11 mappings annotated `status: removed-in-penpot`; schema-validated.
2. `ProcurementListsPage` in Flutter = existing `ProcurementListDetailScreen` (`/b2b/procurement-list/:id`); quick-order "View More" → `/b2b/quick-order`. No new route added.
3. ~~Add `trustSubtle` / `promotionSubtle` to `AgencyColors`.~~ **Done** — added to `AgencyColors` (light `#E0F2F1` / `#FEE8DC`, with `copyWith`/`lerp`); Home uses `colours.trustSubtle` / `colours.promotionSubtle`, local consts removed.
4. Build the 8 missing B2B components (`rfq-card`, `quote-compare-row`, …) if the raw-shape screens are to be componentized. *(not started — declined earlier)*

## Re-verification after follow-ups
- `flutter analyze`: clean (package + app).
- UI package tests: **29 pass** (22 + 7 new).
- App tests: **21 pass**.
- Registry schema validation: **valid**.

## Logical-gap fixes (audit → fix)
Audited `prototype_app` for dead/duplicate handlers, unreachable routes and registry drift, then fixed:

**UX bugs**
- PDP **`Buy Now`** was `onPressed: () {}` → now adds to cart and routes to `/checkout`.
- **Filter** screen: checkboxes were inert (`value:false, onChanged:(_){}`) → now a `StatefulWidget` with real multi-select + Clear + Apply (pops the selection).
- **Search** was static → now functional (filters `demoProducts`, renders results → `/product/:id`) and has a **Filter** action wiring `/filter`.
- **D2C Account** dead links (Saved Addresses / Payment Methods / GST & Invoices / Help / Settings all self-pushed `/account`) → now show a "not part of this prototype yet" SnackBar.
- **D2C checkout** now **clears the cart** and routes to a new **`OrderConfirmedScreen`** (`/order-confirmed`) instead of dropping to `/`.

**Reachability** (routes that existed but were never navigated to)
- `/b2b/price-advantage` → added "My Price Advantage" to the B2B account menu.
- `/b2b/chat` → added "Chat with seller" on Quote Compare.
- `/b2b/site-selector` → added "Choose delivery site" on the Material List.
- B2B account now routes shell-branch paths with `go` (was `push`) via `_openAccountRoute`.

**No-op handlers → real actions**
- B2B chat send → functional (stateful, appends messages, `onSubmitted`).
- Credit "Continue" → `/b2b/checkout`; "Request Increase" → confirmation SnackBar.
- GST "Download All" / per-invoice download, Team "Invite Member" / "Edit", Project "New Project" → honest SnackBars.
- `grep` confirms **0** `onPressed/onChanged: () {}` remain.

**Registry hygiene**
- Registered 8 new components (`b2b.cart-plus-icon-button`, `b2b.quantity-stepper`, `b2b.filter-chip`, `b2b.procurement-list-filter-bar`, `b2b.compact-quick-order-sku-card`, `b2b.trade-product-card-compact`, `b2b.buy-again-card`, `b2b.merchandising-tile`).
- Annotated the 19 declared-but-missing `Pin*` component names `status: declared-not-implemented`.
- Schema-validated.

### Final verification
- `flutter analyze`: clean.
- App tests: **21 pass**.
- `flutter build web --release`: `√ Built build\web`.
- Registry: **valid**.

### Still open (not fixed — data/scope, not logic)
- Many screens render hardcoded fixtures (tracking, GST invoices, approvals, team, split tracking) rather than providers.
- `FilterBar` / `ExceptionTable` registered components exist but are unused.

## Pin* components implemented (`agency_flutter_ui/lib/pin_components.dart`)
All **19** registry-declared components now exist, tokenised via `AgencyColors`, with unit tests:
`PinSearch`, `PinCartLine`, `PinOrderCard`, `PinShipmentStatus`, `PinReturnStatus`,
`PinApprovalStatus`, `PinCreditLimit`, `PinWorkflowAction`, `PinReorderAction`,
`PinForm` (+`PinFormField`), `PinRFQForm`, `PinChart` (line/bar/area/donut),
`PinCarousel`, `PinResponsiveGrid`, `PinMasonryGrid`, `PinToast`, `PinTabs`,
`PinDialog`, `PinDateTimeField`.

Wired into screens (governed components instead of ad-hoc widgets):
- `CartScreen` → `PinCartLine`
- `D2COrdersScreen` → `PinOrderCard`
- `SearchScreen` → `PinSearch`
- `B2BSplitTrackingScreen` → `PinShipmentStatus`
- `B2BApprovalsScreen` → `PinApprovalStatus`
- `B2BCreditScreen` → `PinCreditLimit`

Registry: the 19 `Pin*` entries flipped `declared-not-implemented` → `implemented`
(schema valid; 8 V5 entries also `implemented`).

### Verification
- `flutter analyze`: clean (package + app).
- UI package tests: **48 pass** (29 + 19 new in `test/pin_components_test.dart`).
- App tests: **25 pass** (21 + 4 new in `test/b2b_support_test.dart`).
- `flutter build web --release`: `√ Built build\web`.
- Registry schema: **valid**.

## Fixture → provider wiring + unused components placed
- **New domain/providers:** `domain/b2b_support_models.dart` (`GstInvoice`, `ApprovalItem`,
  `TeamMember`, `ShipmentLeg` + domain enums) and `providers/b2b_support_providers.dart`
  (`gstInvoicesProvider`, `approvalItemsProvider`, `teamMembersProvider`, `splitShipmentsProvider`).
- **Screens now data-driven** (were hardcoded fixtures; now `ConsumerWidget` watching providers,
  mapping domain enums → `Pin*` component states):
  `B2BGstInvoicesScreen`, `B2BApprovalsScreen`, `B2BTeamRolesScreen`, `B2BSplitTrackingScreen`.
  Added `test/b2b_support_test.dart` proving provider overrides drive the UI.
- **Unused components placed:**
  - `PinChart` (bar) on the B2B Credit dashboard.
  - `PinCarousel` around the scheme cards on `B2BSchemesScreen`.
  - `PinDateTimeField` ("Required by") on `B2BRfqDetailScreen` (converted to stateful).
- Fixed a `PinCarousel` height overflow (the scheme card is ~217px tall → height 230).

### Final verification
- `flutter analyze`: clean (package + app).
- UI package tests: **48 pass**.
- App tests: **26 pass**.
- `flutter build web --release`: `√ Built build\web`.
- Registry schema: **valid**.

## Projects/Materials providers + final components placed
- **Models/providers added:** `ProjectSummary`, `ProjectBundle`, `MaterialLine`, `SiteOption`
  (+ `projectsProvider`, `projectBundlesProvider`, `materialLinesProvider`, `sitesProvider`).
- **Screens now data-driven:** `B2BProjectsListScreen`, `B2BProjectDetailScreen`,
  `B2BMaterialListScreen`, `B2BSiteSelectorScreen`.
- **Remaining components placed:**
  - `PinResponsiveGrid` → Projects grid (1/2/3 cols).
  - `PinTabs` → Project detail tab row.
  - `PinDialog.confirm` → Site selector "Confirm Site".
  - `PinMasonryGrid` → `WishlistScreen` (replaced the fixed-aspect `GridView`).
- `test/b2b_support_test.dart` extended (projects provider → UI).

**Previously unplaced — now placed:**
- `PinReorderAction` → `B2BOrdersScreen` (refactored to `PinOrderCard` + `PinReorderAction`; removed `_OrderRow`).
- `PinRFQForm` → new `B2BCreateRfqScreen` (`/b2b/create-rfq`), with a "Create RFQ" entry in the B2B account menu. Validates empty submit → `PinToast` warning; success → `PinToast` + `/b2b/quotes-received`.

**All 19 `Pin*` components are now used somewhere.** App tests: **27 pass**
(+1 create-RFQ test). `flutter build web --release`: `√ Built`.

## Parity gaps closed (Penpot → Flutter)
From the Penpot↔Flutter parity review:
- **B2C Home** (new `lib/widgets/home_header.dart`): added **location** row, **inline search**
  (single search; removed the duplicate AppBar search icon), **trust row** (`TrustBuilderRow`),
  and **hero carousel** (`PinCarousel` + banners). Wired into `ProductListScreen`.
- **B2B Home**: added the **merchandising card lane**, a **"Browse categories"** heading,
  a **"Load more products"** action, and a **header search action** (`B2BHeader.onSearchTap`).
- New test `test/home_header_test.dart`; B2C + B2B parity tables now all ✅.

### Verification
- `flutter analyze`: clean (package + app).
- UI package tests: **48 pass**. App tests: **28 pass**.
- `flutter build web --release`: `√ Built build\web`.

## Quick Order Center — unified workspace (Penpot → Flutter)
Updated Penpot `B2B Quick Order Center` to the unified workspace (header → search → scope toggle →
multi-select list chips → `+ Create List` / `Upload List` → 2×N `CompactQuickOrderSKUCard` grid →
`+ Add SKU to List`), plus a new `Quick Order — Create List` state board. Palette unchanged; reused
`ProcurementListFilterBar` / `CompactQuickOrderSKUCard`. QOC width aligned 375→390 to fit the 358-wide
reused components (matches the V5 Home).

Then implemented in Flutter (`apps/prototype_app/lib/screens/b2b_quick_order_screen.dart`) as one unified
workspace: `PinSearch` + `PinTabs` scope toggle (`In selected lists` / `All catalogue`) +
`ProcurementListFilterBar` (multi-select) + `Create List` (primary) / `Upload List` (secondary) +
2×N `CompactQuickOrderSkuCard` grid + `+ Add SKU to List`. Behaviours: Cart-Plus → common B2B cart;
`Add SKU to List` is separate (never touches cart); Create List → list-name sheet → empty workspace;
search filters; selecting list(s) shows their SKUs; scope toggle prevents silently combining results.
Old tabbed Manual Entry/Upload design removed; test updated to the unified workspace.

### Verified in the Android emulator
- Renders: search, scope toggle, list chips, Create/Upload, empty workspace, `+ Add SKU to List`.
- `All catalogue` → 2×N SKU grid populates (image/title/SKU/price/stepper/Cart-Plus).
- `Create List` → list-name sheet opens.
- `flutter analyze` clean; app tests **28 pass**; APK built + installed.
- Screenshots: `%LOCALAPPDATA%\Temp\opencode\{qoc_view,qoc_grid,qoc_list}.png`.

## Emulator review (Android emulator `medium_phone`, API 36, 1080×2400)
Ran the app on the Android emulator and captured screenshots via `adb`:
**Onboarding → Login → B2C Home → B2B Home** all render correctly (indigo theme).
- **B2C Home**: location, inline search, trust row, hero carousel + dots, category rail,
  Flash Deals, Best Sellers, bottom nav — all present.
- **B2B Home**: header (with search), quick-order filter bar + 2×2 compact SKU cards
  (stepper + cart-plus), View More / Add to Order, Buy Again rail, bottom nav — all present.
- **Defect found + fixed:** section titles truncated ("Flash De…"). `SectionHeader` used a
  `Flexible` title competing with a `Spacer`; changed the title to `Expanded` and removed the
  `Spacer`. **Re-verified in the emulator:** "Flash Deals" / "Best Sellers" now render in full.
- Screenshots: `%LOCALAPPDATA%\Temp\opencode\{home_b2c,home_b2b,b2c_final,b2b_final}.png`.

## Create List flow — closed by GPT-5.6 Sol, implemented in Flutter
**Design closure:** `openai/gpt-5.6-sol` (subagent) produced a decision-complete spec for the Create List
flow (states, per-SKU add-to-list affordance, rules, feedback, data model, edge cases, acceptance
criteria, non-goals). Key decisions: a **visible per-card list control** (not long-press), a
**destination strip** (active list separate from chip filters), dedupe by SKU, immutable list IDs,
add-to-list **never** touches the cart, and `+ Add SKU to List` is **not** a bulk action.

**Implemented** (`apps/prototype_app/lib/screens/b2b_quick_order_screen.dart`):
- Destination strip: "Destination list: Not selected" + Choose list, or "Adding to: {name}" + Change/…(manage).
- Per-SKU control below each card: `Add to list` / `Remove from list` / `Choose list` / `Create list`,
  with a membership summary ("In: A, B" / "Not in any list").
- Create List sheet (name, validation, dedupe), empty workspace + "Browse catalogue" (switches scope &
  focuses search), rename/delete via manage sheet, remove-with-confirm, curated lists read-only.
- Cart-Plus unchanged (cart only); list actions never touch the cart.
- Library: `PinSearch` gained a `focusNode`; `PinDialog.sheet` is now scrollable (`isScrollControlled`).
- Test `b2b_quick_order_test.dart` extended with the full create→browse→add flow.

### Verified in the Android emulator
- Create List → sheet → "MyList" → destination "Adding to: MyList" + empty workspace + green toast.
- Browse catalogue → per-SKU "Add to list" with membership; Add flips to "Remove from list" +
  toast "Added prod_bibcock to \"MyList\"." — cart untouched.
- `flutter analyze` clean; package tests **48 pass**; app tests **29 pass**; APK built + installed.
- Screenshots: `%LOCALAPPDATA%\Temp\opencode\{qoc_open,create_sheet,list_created,catalogue_scoped,sku_added}.png`.

## Trade Offers & Deals (Penpot plan + Flutter)
**Penpot:** plan approved (mapping table: Modify `MerchandisingTile`→`TradeOfferCollectionCard` selectable,
New `HorizontalSKUCard`/`TradeOfferCollectionSelector`/`SortControl`/`FilterControl`/`ProductGrid`/
`CollectionEmptyState`, Reuse `TradeProductCard Compact`/`QuantityStepper`/`CartPlusIconButton`/`FilterChip`;
new Trade Offers & Deals page frame). **Penpot build is pending** — the plugin tab suspended and could not
be focused; nothing was edited on the Penpot canvas.

**Flutter implemented (design applied from the approved plan):**
- New widgets (`agency_flutter_ui/lib/trade_offers.dart`): `HorizontalSKUCard` (image, name, dealer price,
  compact Cart-Plus) and `TradeOfferCollectionCard` (selectable, active state).
- Data: `domain`-adjacent `providers/trade_offers_providers.dart` — `TradeOfferCollection` (id, title,
  description, type, icon, accent, displayOrder, featuredOnHome, productIds, schemeLabel),
  `tradeOfferCollectionsProvider` (6: Seasonal, Best Deals, Schemes, Bulk Buy, Clearance, Festive),
  `featuredTradeOffersProvider`, `tradeOffersForCollectionProvider` (assignment → catalogue, never
  duplicating product records).
- Home `merchandising` section: 3 **selectable** collection cards drive a horizontal **`HorizontalSKUCard`
  swimlane** (one active collection); `See All` opens the page preserving the active collection.
- New page `screens/b2b_offers_screen.dart` at `/b2b/offers`: header → search → `OFFER & DEAL COLLECTIONS`
  selector (N chips, active state) → "Selected Collection / N Products" → Sort / Filter → 2×N
  `TradeProductCardCompact` grid → Load More + empty state.
- Fixed: stock/savings pills overlap (long stock label) in `TradeProductCardCompact`; empty `collection=`
  param now falls back to the first collection.

### Verified in the Android emulator
- Home: Seasonal active → Seasonal SKUs in the swimlane; tapping **Best Deals** switches the swimlane to
  Best Deals SKUs (Tiles/Paint/Drill).
- Offers page: `Best Deals` active (indigo + check), "3 Products", Sort/Filter row, 2×N grid.
- Pills no longer overlap.
- `flutter analyze` clean; package tests **48 pass**; app tests **32 pass**.
- Screenshots: `%LOCALAPPDATA%\Temp\opencode\{offers_section,best_deals_selected,offers_page,offers_default}.png`.

### Open
- Penpot frames for Trade Offers & Deals (all 7 deliverables) — blocked on Penpot tab focus.
- Flutter: sort options limited to 4; Filter is a placeholder; collection lists not persisted.
