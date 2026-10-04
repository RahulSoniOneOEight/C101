# B2B Home V5 — continuation + indigo revert (2026-10-02, session 2)

Continues `session-note-2026-10-02-b2b-home-v5-handoff.md`.
Penpot file `Client101` (`40e06342-8830-80d6-8008-9a92fdfb6804`), page `Screens`.
Kit: `C:\Users\LENOVO\penpot-ai-kit\AGENTS.md` (routed via `skills/penpot-router` → `penpot-component-factory` + `penpot-build-screen`).

## Decision reversal (human-directed this session)
The palette was switched BACK from **Stormy Morning** to the app's **indigo theme**.
Reason: "keep B2B Home + components in indigo only, like the rest of the app."

`modes/light` (`8af5cce6-1485-8016-8008-b4803d077bf1`) reverted (semantic colours kept):

| token | Stormy Morning | indigo (now) |
|---|---|---|
| color.surface.page | #F7FAFE | #F7F8FF |
| color.surface.interactive | {color.powder.100} | #E9ECFF |
| color.content.primary | #384959 | #1F2A44 |
| color.content.secondary | #6A89A7 | #66708A |
| color.action.primary | #384959 | #5B6EE1 |
| color.border.default | #E3EEF9 | #DDE2F2 |
| color.trust | #88BDF2 | {color.teal.600} |

Kept semantic: `feedback.success #3D7A57`, `feedback.error #B54747`, `feedback.warning`, `feedback.info`,
`promotion #FF6B35`. `color.surface.raised` stays #FFFFFF.

> **Orphan:** primitive `color.powder.100 #E6F1FC` (added earlier this session) is now unused.

> **Stale-resolve gotcha:** shapes token-bound *before* a token value change keep the old resolved
> colour. Fix = set `fills/strokes = []` (or reconstruct preserving opacity/image) then `applyToken`.
> Applied to Home (230 shapes) and all new components. PDP + Quick Order Center needed 0 (already indigo).

## Created this session (page `Screens`)
| Component | id | size | notes |
|---|---|---|---|
| `CartPlusIconButton State=normal` | `78cb3f14-49b5-8052-8008-ba6a28f778ca` | 44×44 | indigo fill, cart-plus |
| `…State=loading` | `…ba6a2f8a64fa` | 44×44 | spinner |
| `…State=added` | `…ba6a36a02121` | 44×44 | feedback.success green, check |
| `…State=unavailable` | `…ba6a3dd40bc4` | 44×44 | 60% opacity, cart-plus |
| `…State=error` | `…ba6a452e14cb` | 44×44 | feedback.error red, exclamation |
| `QuantityStepper` | `78cb3f14-49b5-8052-8008-ba6ad40225fd` | 92×36 | compact −/qty/+, radius.pill |
| `TradeProductCard Compact` | `78cb3f14-49b5-8052-8008-ba6c2bcdc35d` | 175×290 | media, brand/MOQ, title, tier chips, price, stepper+CartPlus |
| `CompactQuickOrderSKUCard` | `78cb3f14-49b5-8052-8008-ba6c5eb6ecd5` | 175×108 | thumb, name, SKU, price, qty pill, CartPlus |
| `FilterChip State=unselected` | `78cb3f14-49b5-8052-8008-ba6d119644f8` | auto | pill |
| `FilterChip State=selected` | `78cb3f14-49b5-8052-8008-ba6d11af97a0` | auto | ✓ + indigo |
| `ProcurementListFilterBar` | `78cb3f14-49b5-8052-8008-ba6d1ac49606` | 358×37 | scroll row of chips |

Renamed: old verbose `QuantityStepper` → `QuantityInputRow` (`ec33f47f-ded5-8091-8008-b6e69d5111c1`);
PDP instance kept.

## Home updates (canonical `B2B Home` `19916a9b-9507-800f-8008-ba36311f7829`, 390×2058)
- merchandising heading → **"Trade Offers & Deals"**
- quick-order: `list-filters` → `ProcurementListFilterBar` instance; `sku-grid` → 4× `CompactQuickOrderSKUCard`
- `+ Add row` → **"View More"**
- product-grid: 4× `Trade Product Card Variant=Grid` → 4× `TradeProductCard Compact`
- all token-bound colours re-resolved to indigo

## ProcurementListsPage (new board)
`ProcurementListsPage` id `26003e4f-880c-8020-8008-ba9305e6c0dc`, at (470, 31400), 390×567, flex column,
bg `color.surface.page`. Sections: `top-bar` (back + "Renovation Essentials"), meta, `search`,
`ProcurementListFilterBar`, `sort-row` (Sort: Recommended / Filter), `sku-grid` (4× `CompactQuickOrderSKUCard`),
`footer` (24 items · Est. ₹10,368 + "Add all to Order").
Old `B2B Quick Order Center` (`ec33f47f-ded5-8091-8008-b6f09fb368b3`) left intact as the list-of-lists entry.

## Responsive validation (single board + width check)
Tested via clone at 320 (canonical untouched).
- Product grid + quick-order grid reflow 2-up → **1 column below 390** (2×175 + 8 gap = 358 = 390−32). Rule: **2 cols at ≥390, 1 col below**.
- Rails (filter chips, Buy Again, merchandising tiles, category rail) are horizontal-scroll; they clip at
  320 by design — implement as scroll views, not wraps.
- No vertical/containment breakage.

## Penpot → Flutter mapping
| Penpot | Flutter | Notes |
|---|---|---|
| `B2B Home` | `HomeScreen` | 8 sections flex column |
| `CartPlusIconButton State=*` | `CartPlusIconButton` | 5 states; ≥44 hit target; State enum normal/loading/added/unavailable/error |
| `QuantityStepper` | `QuantityStepper` | compact; 36 visual / 44 touch; min 5, step 1 |
| `TradeProductCard Compact` | `TradeProductCardCompact` | grid tile; 2-up ≥390, 1-up below |
| `CompactQuickOrderSKUCard` | `CompactQuickOrderSKUCard` | thumb/name/SKU/price/qty/CartPlus |
| `FilterChip State=*` | `FilterChip` | selected/unselected; multiselect |
| `ProcurementListFilterBar` | `ProcurementListFilterBar` | horizontal scroll |
| `ProcurementListsPage` | `ProcurementListsPage` | list detail + SKU grid + footer |
| tokens | `AppColors`/theme | action.primary #5B6EE1 etc. |

## Fixed after review
1. **Buy Again Card truncation — FIXED.** The `Buy Again Card`s were *inline boards* (not instances), so
   no detach was needed. Rebuilt both lanes (`buy-again-lane` in §buy-again and `collection-lane` in
   §merchandising) as 110-wide flex columns: image + wrapping title (`font.size.100`) + full-width
   indigo `+ Add`. Titles no longer clip.
2. `color.powder.100` orphan primitive — **REMOVED** (`token.remove()`; primitives back to 50).

## Open items
1. Merchandising collection tiles keep seasonal-teal / deals-orange / schemes-indigo accents (semantic;
   left as-is by decision — can be forced indigo on request; edits `MerchandisingTile` variant internals).
2. "24-SKU grid" — mock shows 4 cards (capped); Flutter should virtualise 24.
3. Vertical scroll/`View More` count not wired (static mock).

## Operational
Penpot plugin tab suspends ~30 s after backgrounding — keep focused during runs.
Export = `penpot.export_shape({shapeId, format:'png', mode:'shape'})`; always inspect.
