# B2B Home V5 — Penpot Handoff (2026-10-02)

Penpot file `Client101` (id `40e06342-8830-80d6-8008-9a92fdfb6804`), page `Screens`.
Worked via the Penpot MCP (`high_level_overview` first, then read-only discovery before writes).
Kit: `C:\Users\LENOVO\penpot-ai-kit\AGENTS.md` (route via `skills/penpot-router`).

## Objective
V5 consolidated UX update of the BuildKart B2B Home: simplify product tiles, make Quick Order
product-led, rename Merchandising → "Trade Offers & Deals", add a dedicated Procurement Lists page
via "View More", and add a compact Cart-Plus action at both tile and Product Detail level.
Execution order was: (1) change mapping, (2) update Penpot, (3) validate screens/responsive,
(4) Penpot→Flutter mapping, (5) Flutter only after design approval.

## Decisions locked (human-approved)
1. One search only, at the top (header). Quick Order has no duplicate search.
2. Responsive coverage: ONE board + width checks (not a board per width).
3. Rebuild Home as a flex column (done).
4. Scope: Home + Add-to-Cart states first, then checkpoint.
5. Old `B2B Home` retired (renamed + moved, NOT deleted).
6. Palette: Stormy Morning approved; `action.primary` = `#384959`; `border.default` = `#E3EEF9`;
   file-wide remap approved (not scoped).

## DONE in Penpot
### New board — canonical Home
`B2B Home` id `19916a9b-9507-800f-8008-ba36311f7829`, at (2350, 30200), 390 × 2090,
flex column (fix/auto), bg bound to `color.surface.page`.
Sections in order: `header`, `quick-order`, `buy-again`, `merchandising`, `category-filter`,
`product-grid`, `cart-summary`, `bottom-nav`.
Reused instances: `B2B / Header`, `search-bar`, `Buy Again Card`, `MerchandisingTile` (×3),
`Trade Product Card Variant=Grid`, `B2B / Bottom Navigation`.

### Retired board
Old `B2B Home` → renamed `B2B Home (deprecated)`, moved to (0, 34000). Kept for reference/links.

### Add-to-Cart states
`Add to Cart — States` id `119292fb-8a99-80bc-8008-ba3c784bbd6b` at (2350, 32400):
normal, loading, added, unavailable (60% opacity), error. Reviewed OK.

### Tokens
New primitives added to set `primitives`:
`color.slate.500` #6A89A7 · `color.powder.200` #BDDCFC · `color.sky.400` #88BDF2 ·
`color.navy.800` #384959 · `color.blue.25` #F7FAFE

Set `modes/light` (id `8af5cce6-1485-8016-8008-b4803d077bf1`, 18 colour tokens) remapped:
| token | before | after |
|---|---|---|
| color.surface.page | #F7F8FF | #F7FAFE |
| color.surface.raised | {color.white} | #FFFFFF |
| color.content.primary | #1F2A44 | #384959 |
| color.content.secondary | #66708A | #6A89A7 |
| color.action.primary | #5B6EE1 | #384959 |
| color.trust | {color.teal.600} | #88BDF2 |
| color.border.default | #DDE2F2 | #E3EEF9 |

Token sets: `primitives` (46), `semantic` (28), `modes/light` (18).
Create API: `penpot.library.local.tokens.sets[i].addToken({type,name,value})`; value edit = `token.value = '...'`.

## OPEN palette gaps (need decision)
Stormy Morning covers 6 colours; these shared roles still hold old values and now look off:
- `color.surface.interactive` (used by chips/steppers) — still old lavender tint.
- `color.promotion` (orange) — used by "Best Deals".
- `color.feedback.success` / `color.feedback.error` — used by tier/added states.
Ask for intended values or "keep as-is".

## OPEN component defect
Reused `Buy Again Card` titles truncate at the card edge (instance-internal fixed text width).
Needs a component-level fix, or `detach()` (requires explicit human approval).

## Change mapping (step 1 deliverable — already produced)
| # | Screen | Existing component | Target | R/M/N | Change |
|---|---|---|---|---|---|
|1|Home header|`B2B / Header`|Header|Reuse|none|
|2|Global search|`search-bar`|SearchBar|Reuse|placeholder "Search products, SKUs"|
|3|Quick Order preview|`B2B / Quick Order` (instance, blank rows)|`CompactQuickOrderSKUCard`|Modify+New|product-led cards (thumb,name,SKU,price,qty,Cart-Plus), 2×N, View More|
|4|Procurement-list filters|my `quick-order` chips|`ProcurementListFilterBar`|New|multi-select scroll chips w/ ✓|
|5|Buy Again|`Buy Again Card`|`MerchandisingSKUCard`|Modify|drop big Add; add stepper + Cart-Plus|
|6|Trade Offers & Deals|`MerchandisingTile` ×3|`ExpandableMerchandisingCollection`|Reuse+Modify|heading rename only|
|7|Category filter|`B2B / Category Rail`|CategoryRail|Reuse|confirm scroll + selected|
|8|Products grid|`Trade Product Card Variant=Grid`|`TradeProductCard` compact|Modify|strip delivery text, unit-price repeat, big Add; add stepper + Cart-Plus|
|9|Cart summary|my `cart-summary`|CartSummary|Keep|align to palette|
|10|Bottom nav|`B2B / Bottom Navigation`|—|Reuse|none|
|11|Procurement Lists page|`B2B Quick Order Center`|`ProcurementListsPage`|Modify|back nav, search, filters, 24-SKU grid, sort/filter, footer|
|12|Product Detail|`B2B Product Detail`|ProductDetail|Reuse+Modify|keep prominent Add to Cart; align palette|
|13|Cart-Plus|my `Add to Cart — States`|`CartPlusIconButton`|New|icon button ≥44px, 5 states|
|14|Quantity stepper|my `sku-card` stepper|`QuantityStepper`|New|shared compact −/qty/+|
|15|Cart action|—|`SharedCartService`|Flutter only|no Penpot change|

## Next immediate steps (in order)
1. Decide the 3 open palette gaps above; apply to `modes/light`.
2. `CartPlusIconButton` + 5 states (normal/loading/added/unavailable/error), ≥44px target.
3. `QuantityStepper`.
4. Compact `TradeProductCard` (remove delivery text, unit-price repeat, big `Add 5 pcs`; add stepper + Cart-Plus; keep image, brand, 2-line title, MOQ, tiers, dealer price).
5. `CompactQuickOrderSKUCard` (2×N, 4 shown).
6. `ProcurementListFilterBar`.
7. Update Home sections (`Trade Offers & Deals` rename, Quick Order, Products).
8. `ProcurementListsPage` (extend `B2B Quick Order Center` id `ec33f47f-ded5-8091-8008-b6f09fb368b3`).
9. PDP alignment.
10. Responsive validation 320/334/360/390/400/430.
11. Penpot→Flutter mapping table; Flutter ONLY after design approval.

## Reference IDs
- Canonical Home: `19916a9b-9507-800f-8008-ba36311f7829`
- Deprecated Home: `190a8ff3-51b8-800f-8008-b5900abf6a6a` (now at 0,34000)
- Add-to-Cart states: `119292fb-8a99-80bc-8008-ba3c784bbd6b`
- mods/light set: `8af5cce6-1485-8016-8008-b4803d077bf1`
- sectors: `primitives` `8adb3a68-ddd2-8002-8008-b47fe67cdf34`, `semantic` `8af5cce6-1485-8016-8008-b480140a5bbb`
- `B2B Quick Order Center`: `ec33f47f-ded5-8091-8008-b6f09fb368b3`
- `B2B Product Detail`: `ec33f47f-ded5-8091-8008-b6e6cbe8eb33`

## Operational notes
- The Penpot plugin tab SUSPENDS when backgrounded; keep it focused/visible or exports time out then the tab stops.
- Export = `penpot.export_shape({shapeId, format:'png', mode:'shape'})`; ALWAYS look at the image.
- Board layout is `board.flex` (NOT `board.layout`); `addFlexLayout()` after creating a board.
- Cloning instance children is not editable; detach needs approval. Legacy sections are locked instances.
- New board default fill is opaque white - clear it (`fills = []`) and bind a token.

## Flutter
UNTOUCHED. Do not start Flutter until the Penpot design is approved.
