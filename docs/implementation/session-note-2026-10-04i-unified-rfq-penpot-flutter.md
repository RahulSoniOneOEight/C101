# Session note — 2026-10-04 (i) — Unified multi-SKU RFQ (Penpot + Flutter)

## Request

Unify the B2B Request-for-Quotation journey into one shared, multi-SKU basket:
replace the large RFQ text button with a compact document-plus icon beside
Cart-Plus; add a shared RFQ basket; build a single-screen multi-SKU workspace
with inline quantity + target price; and connect
tile → basket → workspace → submit → quote → accept → order. Preserve the
BuildKart palette, tokens, and components; extend, don't rebuild.

## Penpot (design) — file changes

Run ledger `penpot-ai / buildkart-rfq-2026-10-04` (phase 4).

- **`RFQPlusIconButton`** family (Screens page, beside `CartPlusIconButton`):
  `State=normal | loading | added | unavailable | error`. 44×44, `radius.pill`,
  `color.action.primary` / `color.feedback.success` / `color.feedback.error`,
  `color.content.inverse` strokes; `unavailable` uses 0.38 opacity.
- **`QuantityStepperCompact`** — 56×32 compact stepper (`surface.raised`,
  `border.default`, `content.primary`), leaves the shared `QuantityStepper`
  untouched.
- **`TradeProductCard Compact`** footer → `[− qty +]  [Cart+] [RFQ+]`; card
  height 290 → 286.
- **`B2B RFQ Workspace`** (360×1114) — top bar + `Draft` pill, `RFQ Basket ·
  3 SKUs`, three SKU rows (read-only dealer price, Qty, Target Price, remove),
  `+ Add Another SKU`, Delivery Project/Location, Required By, Optional Remarks,
  Estimated Target Value, `[Save Draft] [Submit RFQ]`.

Tokens used: `color.surface.page/raised/interactive`, `color.content.primary/
secondary/inverse`, `color.action.primary`, `color.feedback.success/error`,
`color.border.default`, `radius.card/control/pill`. **No new tokens proposed.**

## Flutter (code) — implementation

- `packages/agency_flutter_ui/lib/b2b_v5.dart`
  - `RFQPlusState` enum + `RFQPlusIconButton` (5 states).
  - `QuantityStepper` gains a `dense` mode (narrow-tile fallback).
  - `TradeProductCardCompact` footer → responsive single row (Cart-Plus +
    RFQ-Plus, `Key('tradeCardActions')`): content ≥ 158px uses a compact stepper
    + 40px actions; narrower uses a dense stepper + 26px actions, so the tile
    cannot overflow at 320px. `kB2bProductCardExtent` 370 → 334.
- `domain/b2b_trade_models.dart` — `RfqStatus`; `B2BQuotationLine.targetUnitPrice`
  + `seller`; `B2BQuotationCart` draft fields (status, delivery, requiredBy,
  remarks, reference), `estimatedTargetTotal`, JSON round-trip.
- `providers/b2b_trade_providers.dart` — single shared `b2bQuotationCartProvider`
  gains `setTargetPrice`, `setDeliveryLocation`, `setRequiredBy`, `setRemarks`,
  `saveDraft`, `submit` (assigns an `RFQ-####` reference; never creates an order
  or payment), and persists the draft through `LocalStore`. Duplicate
  SKU/variant merge is preserved and now keeps the buyer target price.
- `data/local_store.dart` — `readRfqDraft` / `writeRfqDraft` (`b2b_rfq_draft_v1`).
- `screens/b2b_quote_screens.dart` — `B2BRfqWorkspaceScreen` replaces the
  single-SKU `B2BRfqDetailScreen`; the PDP `RFQ` action now adds the selected
  SKU/tier/seller to the shared basket with a **View RFQ** snackbar.
- `widgets/trade_product_tile.dart` — RFQ-Plus adds the current SKU + quantity to
  the basket, shows feedback, stays on screen.
- `screens/b2b_shell.dart` — account menu `RFQ Basket` → `/b2b/rfq`.
- `experience/design/ui-implementation-registry.yaml` — registered
  `b2b.rfq-plus-icon-button`, `b2b.rfq-workspace`, and the dense stepper variant.

## Verification

- `flutter analyze`: clean (package + app).
- Package tests: **51 passed** (incl. RFQ-Plus states/tap, dense stepper).
- App tests: **80 passed** (incl. `b2b_rfq_journey_test.dart`: merge + target
  price, remove, draft persistence + `submit` reference, workspace render; and
  `b2b_product_card_test.dart`: no overflow + trailing-gap + Cart-Plus/RFQ-Plus
  at **320/334/360/390/400/430px**).
- Android emulator (medium_phone, ~411px): tile footer `[− qty +] [Cart+] [RFQ+]`;
  RFQ-Plus shows “added to RFQ / View RFQ”; workspace renders basket, Qty/Target
  Price inputs, delivery/date/remarks, estimated value, Save Draft / Submit RFQ.

## Assumptions / open items

- RFQ draft + submission are a **device-local development fixture** until a
  backend RFQ contract is approved; submission does not create an order/payment.
- The legacy single-SKU `B2BCreateRfqScreen` (`/b2b/create-rfq`) remains in the
  codebase but is no longer linked from the account menu; it can be retired in a
  follow-up.
- Narrow-tile dense actions are 26px (≥ WCAG 2.2 AA 24px minimum); the compact
  stepper is 28px tall. At ≥ ~390px the full 40px layout is used.
- Penpot `B2B RFQ Detail / Quotes Received / Quote Compare / Accept Quote /
  Quotation Cart` boards were not rebuilt — they already cover the status,
  comparison and order-handoff states; align them in a later pass if needed.

## Scope

No palette, token, D2C journey, or unrelated screen changes.

## Addendum — 2026-10-04 (i.1)

Follow-up request: RFQ is removed from the compact product tiles (kept on the
PDP), and the cart gets its own independent Request-Quotation journey.

- **Penpot:** `TradeProductCard Compact` footer → `[− qty +] [Cart+]` (RFQ-Plus
  instance removed). `B2B RFQ Workspace` gains a `Search SKUs to add…` row.
  `B2B Quotation Cart` gains a tokenized `Request Quotation` section
  (search field + start action) above Proceed to Checkout.
- **Flutter:** `TradeProductCardCompact` no longer renders RFQ (removed
  `onRfq`/`rfqState`; `tradeProductTile` updated); the PDP keeps its RFQ action
  (now also writes to the shared basket). `B2BRfqWorkspaceScreen` gained a
  catalogue **search-and-add** field (results add the SKU to the basket) and now
  renders even with an empty basket. `B2BQuotationCartScreen` gained a
  `Request Quotation` section (populated) and a `Request a quotation instead`
  link (empty) that open `/b2b/rfq`.
- **Tests:** tile test now asserts **no** `RFQPlusIconButton`; RFQ journey test
  covers search-and-add and the cart Request-Quotation entry.
- **Checks:** `flutter analyze` clean; app tests **83 passed**; package tests
  **51 passed**; emulator confirmed tiles RFQ-free, PDP RFQ present, and the cart
  journey opening the searchable RFQ workspace.

## Addendum — 2026-10-04 (i.2)

Follow-up request: the B2B cart page gets **two sections** — (1) the cart with
related-product merchandising, and (2) a Request Quotation part at the bottom.

- **Flutter (`B2BQuotationCartScreen`):** restructured into
  - **Section 1 · Your order** — cart lines + subtotal/GST/total, followed by a
    `_RelatedProductsRail` (“You may also like”) that reuses the shared
    `tradeProductTile` in a horizontal swimlane (excludes items already in the
    cart), with `Proceed to Checkout` as the section footer.
  - **Section 2 · Request Quotation** — the search-and-request entry that opens
    `/b2b/rfq`.
  - Empty state is now an inline card (“Your cart is empty” + Return to Quick
    Order) so the related rail and Request Quotation still show.
- **Penpot (`B2B Quotation Cart`):** added a tokenized `related-products`
  (“You may also like”) rail above the existing `Request Quotation` section.
- **Tests:** cart test updated for the new empty copy and the related rail.
- **Checks:** `flutter analyze` clean; app tests **83 passed**; package
  **51 passed**; emulator verified the cart sections.

## Addendum — 2026-10-04 (i.3)

Follow-up request (Flutter-only, per request): the B2B Home “Browse categories”
swimlane should use the **same icons + format as B2C**.

- `b2b_home_screen.dart` — replaced `TradeCategoryRail` with the shared
  `CategoryIconRail` (the B2C component): 56px pastel circle + outlined icon +
  label, single-select accent ring, leading **All** chip. Selection routes to
  `/b2b/catalogue?category=<id>` (All → `/b2b/catalogue`). Icons are the existing
  B2B `*_outlined` Material set, matching B2C.
- `TradeCategoryRail` remains available in the shared package (unused here).
- **Checks:** `flutter analyze` clean; app tests **83 passed**; emulator verified
  the B2B category rail rendering like B2C.

## Addendum — 2026-10-04 (i.4)

Follow-up request: B2C Orders need not be a separate bottom-nav menu; it can be
part of Account.

- `d2c_shell.dart` — bottom nav reduced to **4 tabs** (Home / Browse / Cart /
  Account); the **Orders** tab removed.
- `app_router.dart` — removed the Orders `StatefulShellBranch`; `/orders`,
  `/orders/:id` and `/track` are now **top-level** routes (no bottom nav) so
  Account → **My Orders** opens them as a pushed page.
- Account already links `My Orders → /orders`.
- **Checks:** `flutter analyze` clean; app tests **83 passed**; emulator verified
  the 4-tab nav and Account → My Orders.

## Addendum — 2026-10-04 (i.5)

Follow-up request: add a quick link to Orders on the B2C **Cart** page.

- `cart_screen.dart` — AppBar action (receipt icon → `/orders`) plus an inline
  **My Orders** quick-link card beneath the related merchandising
  (“Track shipments and reorder past purchases”). Uses `Material` for correct
  `ListTile` ink.
- `d2c_cart_browse_test.dart` — asserts the cart exposes the Orders quick link.
- **Checks:** `flutter analyze` clean; app tests **83 passed**; emulator verified
  the cart quick link opens Orders.


