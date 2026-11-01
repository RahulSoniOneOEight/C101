# B2B cart vs B2C cart — benchmark + parity (2026-11-01)

**Live web:** `3138a00` · 3,986,101 bytes · SHA-256 `4345844ae591af46e55ddaba02288976409e7e89f38c79da5e30c6e30e6f3f75`

## 1. Benchmark

| Capability | B2C cart | B2B cart before | B2B cart now |
|---|---|---|---|
| Product image on the line | yes | generic icon | **yes** |
| Quantity stepper | yes | yes | yes |
| **Remove line** | yes | no (only decrement) | **yes** (with snackbar) |
| Discuss (chat) | yes | yes | yes |
| Related products rail | yes | yes | yes |
| Promo / discount line | FLAT5 shown | not shown (applied at order) | still at order — no promo entry in B2B |
| Delivery row in cart | ₹99 | missing | **“Calculated at checkout”** |
| GST | Included | Included | Included |
| Checkout summary | Subtotal / Discount / Delivery / Total | Subtotal + note | **Subtotal / GST / Delivery / Total** |
| Fee amount before placing | yes | no (rule only) | no (same — needs an API) |
| Sticky CTA | yes | fixed bottom button | yes |
| Empty state | yes | yes | yes |

## 2. What changed

- **Cart line image** — the B2B cart now renders the catalogue thumbnail (with the icon as a fallback).
- **Remove** — explicit delete on every line; removes the SKU and confirms with a snackbar. Previously a buyer had to decrement to zero.
- **Delivery row** — the cart summary now names delivery (“Calculated at checkout”) instead of omitting it; the total line stays the goods total, matching how B2C separates the fee.
- **Checkout summary** — mirrored the B2C structure: Subtotal · GST Included · Delivery (at placement) · Total, plus the placement note. Delivery still resolves from the selected site pincode at order time.

## 3. Remaining gap (needs API)

The B2B checkout still cannot show the **fee amount** before placement. B2C gets it from `POST /carts/{id}/delivery` against the address; B2B needs an equivalent preview for the selected site (delivery-rates module). Until then the cart and checkout state it explicitly rather than hiding it.

## 4. Verification

| Check | Result |
|---|---|
| B2B cart shows the line image | PASS |
| Remove line → cart empties | PASS |
| Cart summary: Subtotal ₹350 · GST Included · Delivery Calculated at checkout · Total ₹350 | PASS |
| Checkout summary: Subtotal / GST / Delivery At placement / Total + note | PASS |
| B2C cart unchanged | PASS |
| Tests | 315/315; `b2b_checkout.png` golden refreshed (intended B2B change) |
| Console errors | 0 |

Screenshots: `evidence/qc/screenshots/b2b_cart_parity.png`, `b2b_checkout_parity.png`.

## 5. Rollback

Redeploy `ec92f03`. No data change.
