# QC — B2C + B2B order flows and the last four updates (2026-11-01)

Live staging: web `3e28237`, medusa `f0dc0126f5de`, workspace `5fc663e283dd`, API `e4145643172a`.
Method: real browser sessions against https://buildkart-staging.web.app at 390×844, plus DB/API reads.

## 1. B2C order flow

| Step | Observed | Result |
|---|---|---|
| PDP | 3M Mirror Mount Tape ₹432 · MRP ₹480 · 10% off · “In stock · Free delivery in 3–5 days” | PASS |
| Add to cart | line added, no error toast | PASS |
| Cart | qty stepper, FLAT5 −₹21.60, **Delivery UrbanBuild Supply ₹99** resolved automatically, “Continue checkout” | PASS |
| Checkout | address + pincode 301019, read-only fee ₹99, delivery total ₹99, **Total ₹509.40**, sticky Place order | PASS |
| Confirmation | **BK-261101-P7Q3WJ** · ₹509.40 · “Simulated payment authorized” · View my orders | PASS |
| Console / page / HTTP errors | none | PASS |

Screenshots: `qc/b2c_cart.png`, `qc/b2c_checkout.png`, `qc/b2c_confirmation.png`.

## 2. B2B order flow

| Step | Observed | Result |
|---|---|---|
| Trade catalogue → product | Wonder Cement ₹350, tier selector, Add to Cart | PASS |
| Quotation cart | line + subtotal ₹350, GST Included | PASS |
| Business Checkout | saved sites, PO number, GST invoice, payment modes (credit/UPI/bank/COD), fee rule note | PASS |
| Site selection | Site A — Main block, Pune 411001 selected → Place Business Order enabled | PASS |
| Placed order | **og_01M6ASXQ0D0J4AZFR8H4CA36QQ** · subtotal ₹350 · discount −₹17.50 · **Shipping ₹99** · **Total ₹431.50** · GST invoice raised | PASS |
| Fee timing | amount only appears on the placed order (rule shown before) | PASS (known limitation) |
| Errors | none | PASS |

Screenshots: `qc/b2b_cart.png`, `qc/b2b_checkout.png`, `qc/b2b_sites.png`, `qc/b2b_confirmation.png`.

## 3. Modules changed in the last four updates

### U-013 — price units
| Check | Result |
|---|---|
| IPHONE 17 White / Black | ₹1,95,000 / ₹1,85,000 (API `unit_amount_minor` 19,500,000 / 18,500,000) | PASS |
| List price | ₹2,00,000 unchanged | PASS |
| Non-Apple price sanity | Tape ₹432 vs ₹480 (10% off) | PASS |
| Bulk list/GST path | fixed in `studio-form.tsx` (source + built panels) | PASS-CODE |
| <10% guard | shipped (`priceUnitWarning` + confirm) | PASS-CODE |

### U-014 — option integrity
| Check | Result |
|---|---|
| IPHONE 17 | Color option linked; 2 variants (Black, White), ranks 0/1 | PASS |
| Sumsan Fold 7 | Color option linked; 3 variants (Blue, Black, White), ranks 0/1/2 | PASS |
| `product_variant_option` links | 5 rows for the two products (0 before) | PASS |
| `__default__` on multi-variant | retired for both | PASS |
| Studio editor deadlock | title-based fill + new copy shipped in admin/vendor bundles | PASS-CODE (UI pass needs admin credentials) |

### U-015 — Smoke cleanup
| Check | Result |
|---|---|
| Smoke 134657 / 241288 / 594475 | archived (`draft`), detail API 404, absent from catalogue | PASS |
| Published count | 263 → 260 | PASS |
| Other Smoke products | **4 remain published** (707433, 208869, 685854, 712935) — outside the allowlist | OPEN |

### U-017 — product page
| Check | Result |
|---|---|
| Gallery | 4 slides, counter `n / 4`, dots + thumbnails, first slide real thumbnail | PASS |
| Representative slides | “Representative image” chip + alt text on slides 2–4 | PASS |
| Discuss | secondary text action under Add/Buy, absent from the sticky bar | PASS |
| Sticky bar | price + Add + Buy only, appears after the buy box scrolls | PASS |
| Section order | price → variants → CTA → trust → specs → description → full specs → price comparison | PASS |
| Demo labelling | “Demo content” chips on specs/description | PASS |

Screenshots: `qc/qc_iphone.png`, `qc/qc_browse.png`, `qc/qc_smoke_search.png`.

## 4. Carried modules re-checked

| Module | Check | Result |
|---|---|---|
| U-011 Browse | no “Recommended for you” strip; first tile 175 px at y≈545 | PASS |
| Delivery fee (U-009) | B2C ₹99 auto-resolved; B2B ₹99 at placement | PASS |
| U-007 tile | tile layout intact on Browse | PASS |
| B2B chat parity | participants/composer present (previous run) | PASS |

## 5. Open items

1. Four extra Smoke products still published (needs a new allowlist).
2. B2B pre-placement fee amount (product decision, currently documented).
3. Product Studio create→reload UI pass (admin credentials required).
4. APK distribution (tester group not configured).

---

## 6. Addendum — add-to-cart fix + PDP benchmark batch (`59e8796`, `ebf5b92`)

Reported: “add to cart is not working in products”. Root cause: the write succeeded but the UI gave no
visible confirmation (900 ms toast, no cart badge).

| Check | Result |
|---|---|
| Add button flips to “Added” | PASS (observed ~1.3 s after tap) |
| Toast “Added 1 to cart” | PASS (visible, 1.8 s) |
| Bottom-nav cart badge | PASS (`1`) |
| Qty stepper → add 2 | PASS (cart line quantity 2, FLAT5 −₹43.20) |
| Breadcrumb | PASS (“Catalogue / Tiles & Building Materials”) |
| Share action | PASS (copies the product link) |
| Cart → checkout | PASS (fee ₹99 read-only, total present) |
| Console / page errors | 0 |

Screenshots: `screenshots/pdp_added.png`, `pdp_added_qty2.png`, `cart_qty2.png`,
`checkout_after_fix.png`.
