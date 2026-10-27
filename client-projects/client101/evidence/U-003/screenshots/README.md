# U-003 screenshots — pending staging

The component render and widget test prove the `Flat5% · Auto` chip is now an `InputChip` with a
delete action; the runtime screenshots require the deployed Flutter app against staging.

Capture after the deploy gate:

1. `cart-flat5-auto.png` — cart with one line showing `Flat5% · Auto` and the remove (×) action.
2. `cart-flat5-removed.png` — same cart after tapping ×, discount 0%.
3. `cart-order10.png` — same cart after applying `ORDER10`, showing exactly 10% and no Flat5%.
4. `checkout-order10.png` — checkout summary with the 10% discount.

Store the PNGs in this folder. Do not edit or retouch the screenshots; they are evidence.
