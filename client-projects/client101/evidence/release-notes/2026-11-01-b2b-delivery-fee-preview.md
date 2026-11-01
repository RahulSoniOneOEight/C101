# B2B delivery fee resolved before placement (2026-11-01)

**Live web:** `dcfd729` · `main.dart.js` 3,991,623 bytes · SHA-256
`34c3ccff419dacc63194f4522893af52fa85df83c299c4f2d2e7353d296e8661` · banner `STAGING · dcfd729`

## 1. What was wrong

The B2B quotation cart is a local object until the buyer places the order, so
the cart and checkout could only say **“Delivery — calculated at placement”**.
The fee was correct in the placed order (`₹350 − ₹17.50 + ₹99 = ₹431.50`) but
the buyer could not see it beforehand, unlike the B2C cart which resolves the
same per-seller fee from its bound address.

## 2. What changed

- **Prepared canonical cart.** `B2BOrderDraftNotifier` builds the same
  canonical B2B cart the order uses, one step early, and exposes its delivery
  lines, shipping total and payable total.
- **Resolved on checkout open and on every site change.** Opening checkout with
  a saved site prices the fee; choosing another site re-addresses the *same*
  cart instead of creating another one. A different basket (SKU, quantity or
  buyer-visible unit price) rebuilds it.
- **Honest summary.** `Subtotal · Discount · GST · Delivery · Total`, all from
  the engine. The discount row was added because the canonical cart carries
  `FLAT5`; without it the total looked wrong. A per-seller breakdown appears
  when more than one seller ships.
- **Credit check uses the payable total** (goods + delivery), not just goods.
- **Placement completes the prepared cart** instead of rebuilding it; the
  trade-price guard is unchanged.
- Copy updated: the delivery policy card and the summary note now describe the
  fee being shown before placement.

The fee is not duplicated in the app: it is the shipping method Medusa priced
from the seller's delivery rate for the site PIN, i.e. the exact number the
order will carry.

## 3. Verification

| Check | Result |
|---|---|
| Cart before a site is chosen | `Subtotal ₹350 · Delivery Calculated at checkout · Total ₹350` | PASS |
| Checkout after choosing Site A (411001) | `Subtotal ₹350 · Discount -₹17.50 · GST Included · Delivery ₹99 · Total ₹431.50` | PASS |
| Back to the cart after pricing | `₹99` / `₹431.50` shown (draft reused, no second cart) | PASS |
| Place order | `og_01M6BW81YK6MFCWERRGZGER2NW` — `₹350 − ₹17.50 + ₹99 = ₹431.50` | PASS |
| Confirmation screen | `Subtotal ₹350 · Discount -₹17.50 · Shipping ₹99 · GST Included · Total ₹431.50` | PASS |
| B2C cart unchanged | `Discount · FLAT5 -₹20` · `Delivery PowerMax Depot · ₹99` | PASS |
| Console / page errors | 0 (B2B and B2C runs) | PASS |
| Tests | 317/317 (2 new: draft reuse/rebuild, checkout fee rendering) | PASS |

Screenshots: `b2b_checkout_priced.png`, `b2b_cart_priced.png`,
`b2b_confirm.png`, `b2c_cart_smoke.png`.

## 4. Behaviour to know

- Opening B2B checkout with a saved site now creates the canonical cart. That
  is the same lifecycle the B2C cart already has (a cart exists from the first
  add), and it is what makes the fee real rather than a guess. Changing the site
  reuses that cart; changing the basket replaces it.
- Widget tests and the offline fixture never create carts: the resolution is
  gated by `b2bDeliveryQuoteEnabledProvider` (live only).

## 5. Open finding (not fixed here)

Searching `QC` in the live B2C store returns **6 test products** alongside real
stock: `QC Auto Publish 2610`, `QC CHG-086 272555`, `QC Import 124539`,
`QC Import 124657`, `QC Studio 127088`, `QC CSV 127088`. All six have no image
and should be archived like the earlier U-015/U-024 cleanups. Blocked: this
session has no administrator credentials and no database access to take the
archive backup. Recorded in the release register.

## 6. Rollback

Redeploy `3138a00` (`firebase hosting:rollback` or rebuild). No data change in
this release; the B2B orders placed during QC are ordinary staging orders.
