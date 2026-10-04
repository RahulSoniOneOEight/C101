# Session note — 2026-10-04 (j) — B2B Quick Order: Operate Lists / Manage Lists split

## Request

Refactor the B2B Quick Order Center into two connected experiences — **Operate
Lists** (primary, fast purchasing) and **Manage Lists** (secondary, list
maintenance) — without rebuilding the app or touching unrelated journeys.

## Mapping (discovery before editing)

| Existing Flutter component | Reuse / Modify / New | Required change |
|---|---|---|
| `B2BQuickOrderCenterScreen` | Modify | Operate-Lists only: search + scope tabs, list chips + `Manage Lists →`, products-from-selected-lists grid, bottom Cart bar. Removed destination selector, New List, Add-SKU-to-List, template controls. |
| `CompactQuickOrderSkuCard` (`b2b_v5.dart`) | Reuse | Image/title/SKU/price + qty stepper + Cart-Plus + `onTap`→PDP. Grid `mainAxisExtent` 132. |
| `ProcurementListFilterBar` / `PinSearch` / `PinTabs` | Reuse | Multi-select chips, search, scope toggle. |
| `procurementListsProvider` notifier | Modify | Added `replaceItems`, `setItemQuantity`, `createWithItems`, `duplicateList`, `saveEdited` (copy-on-edit for curated), `listById`. |
| `ProcurementList` / `ProcurementListItem` | Reuse | `quantity` is the persisted saved default. |
| `LocalStore` procurement lists | Reuse | Unchanged. |
| `ProcurementListDetailScreen` | Reuse | Unchanged; route `/b2b/procurement-list/:id`. |
| Manage Lists | New | `ProcurementListsManagerScreen`. |
| List editor (create + edit) | New | `ProcurementListEditorScreen` (one reusable screen). |
| Routes | Added | `/b2b/procurement-lists`, `/b2b/procurement-lists/new`, `/b2b/procurement-lists/:id/edit`. |

## Changes

**Operate Lists** (`b2b_quick_order_screen.dart`)
- Search, `In selected lists` / `All catalogue` scope, `MY PROCUREMENT LISTS`
  header + `Manage Lists →`, multi-select chips, `Products from selected lists`
  (`N lists selected · M SKUs`), 2×N SKU grid (image, short title, dealer price,
  qty stepper, independent Cart-Plus), bottom `Cart (N items) · View Cart →`.
- Removed all list-management UI (destination selector, New List, Add SKU to
  List, template controls).
- Purchase quantities live in `_draftQty` (temporary) and never write list
  defaults.

**Manage Lists + Editor** (`b2b_procurement_lists_screen.dart`, new)
- Manager: list search, `Create New List`, per-list card (name, source pill,
  `N SKUs`, description) with rename / duplicate / delete-with-confirmation.
  No purchasing controls.
- Editor: one screen for Create + Edit — List Name, ADD PRODUCTS (search),
  `Scan` + `Upload` (clearly-labelled development fixtures — no scanner/parser
  in this build), SKUs in this list (image/name/SKU, `Default Qty` stepper,
  Remove), `+ Add Another SKU`, `Save Changes`, and an unsaved-changes guard.
- Adding/editing SKUs here never touches the cart. Curated/suggested sources
  save as an editable buyer-owned copy (`saveEdited`).

**State separation (kept independent):** `list.defaultQuantity` (persisted),
`quickOrder.purchaseQuantity` (`_draftQty`, temporary), `cart.quantity` (B2B
quotation cart). Stable SKU id used as the merge identity.

## Verification

- `flutter analyze`: clean (app + package).
- App tests: **91 passed** — incl. new: operate-lists structure (management
  controls absent), multi-list selection, combined grid, temporary purchase qty
  not writing the saved default, saved-default update independent of the cart,
  duplicateList, curated copy-on-edit, manager render, editor create + save,
  editor default-qty persist, duplicate-name blocking, delete.
- Package tests: **51 passed**.
- Android emulator (medium_phone): B2B Home → Quick Order **View More** →
  Operate Lists (select Seasonal + Kitchen Works → `2 lists selected · 6 SKUs`,
  2×N grid) → `Manage Lists →` → My Procurement Lists → Edit (name, add
  products, Scan/Upload, default qty, Remove) → Save → back to Operate Lists
  **with selections and Cart (6 items) preserved**.

## Assumptions / open items

- Barcode `Scan` and `Upload` (CSV/Excel/PDF) have no implementation in this
  build; both surface as clearly-labelled development fixtures pending an
  approved scanner/parser.
- All seeded lists are buyer-owned (`buyerSaved`); the curated copy-on-edit path
  is implemented and unit-tested but no curated fixture is seeded.
- Penpot was left unchanged (Flutter-only request).
