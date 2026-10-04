# Session note — 2026-10-04 (b) — B2C Browse icons + Cart page + merchandising

## Inputs
1. **Browse tab should show category icons** like the Home tab.
2. **Cart page not available in the emulator**; it should have **related-product
   merchandising**.

## Reuse / Modify / New
| Input | Component | R/M/N |
|---|---|---|
| Icon categories in Browse | `BrowseScreen` → `CategoryIconRail` | Modify |
| Cart page reachable/usable offline | `CartNotifier` (cart provider) | Modify |
| Related-product merchandising | `CartScreen` + `MerchandisingUnitCard` | Modify/Reuse |

## Root cause of "cart not available"
The demo catalog has **no `variantId`**, so:
- the D2C PDP disabled Add to Cart (`canAdd = product.variantId != null`), and
- with no Medusa backend, `CartNotifier.addItem` set the cart into an **error
  state** → the Cart page rendered "Couldn't load data".

## Changes
- `packages/agency_flutter_ui/lib/agency_flutter_ui.dart` — (earlier) no change
  needed; `CategoryIconRail`/`CategoryIconItem` already icon-led + selectable.
- `apps/prototype_app/lib/screens/d2c_shell.dart`
  - Browse category filters switched from text chips to the **icon-led
    single-select `CategoryIconRail`** (All + categories), same as Home.
- `apps/prototype_app/lib/screens/product_detail_screen.dart`
  - `canAdd = product.price != null`; add-to-cart uses
    `variantId ?? product.id` (Add to Cart / Buy Now) so demo products work.
- `apps/prototype_app/lib/providers/cart_providers.dart`
  - Cart operations **degrade to a local cart** on API failure instead of
    raising an error state (local upsert of line items + totals + persistence).
- `apps/prototype_app/lib/screens/cart_screen.dart`
  - Keeps the line items, quantity controls and checkout summary, and adds a
    **"You may also like"** `MerchandisingUnitCard` rail of related products
    (with add-to-cart), shown for both empty and populated carts.

## Verification
- `flutter analyze` clean; `flutter test` — app **45** pass (new
  `d2c_cart_browse_test.dart`: offline cart fallback, cart merchandising,
  Browse icon rail).
- Emulator QA (medium_phone/API 36):
  - Browse tab shows **icon-led categories** (All selected with a ring).
  - Cart tab: added a Flash Deals item → **18V Drill Kit** line, Subtotal/Total
    ₹6499, Continue checkout, and the **"You may also like"** merchandising rail.

## Assumptions / open
- The offline cart is a prototype fallback; with a real Medusa backend the API
  remains the source of truth.
- Related products are the non-in-cart catalogue items (up to 8).
- Flutter-first per request (Penpot not updated).
