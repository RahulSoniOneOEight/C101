# U-003 screenshots — pending app session

The offers panel renders `Flat5% · Auto` as an `InputChip` with a delete action; the widget test
`apps/prototype_app/test/cart_promotions_test.dart` proves the chip removes the offer from the
cart state.

Runtime cart/checkout screenshots require the Flutter app running against staging. The app is
**source-only on staging** (`app-staging` serves the Next.js storefront), so these are captured
from a local app session during the live cart QC:

1. `cart-flat5-auto.png` — cart with one line showing `Flat5% · Auto` and the remove (×) action.
2. `cart-flat5-removed.png` — same cart after tapping ×, discount 0%.
3. `cart-order10.png` — same cart after applying `ORDER10`, showing exactly 10% and no Flat5%.
4. `checkout-order10.png` — checkout summary with the 10% discount.

The admin product-studio screenshots for the combined release are in
`client-projects/client101/evidence/CHG-086/screenshots/`.

Store the U-003 PNGs here. Do not edit or retouch the screenshots; they are evidence.
