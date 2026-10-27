# U-003 screenshots — pending app session

The offers panel renders `Flat5% · Auto` as an `InputChip` with a delete action; the widget test
`apps/prototype_app/test/cart_promotions_test.dart` proves the chip removes the offer from the
cart state.

Runtime screenshots require the Flutter app running against staging. The app is **source-only on
staging** (`app-staging` serves the Next.js storefront), so these are captured from a local app
session during the live cart QC:

1. `cart-flat5-auto.png` — cart with one line showing `Flat5% · Auto` and the remove (×) action.
2. `cart-flat5-removed.png` — same cart after tapping ×, discount 0%.
3. `cart-order10.png` — same cart after applying `ORDER10`, showing exactly 10% and no Flat5%.
4. `checkout-order10.png` — checkout summary with the 10% discount.

Store the PNGs here. Do not edit or retouch the screenshots; they are evidence.
