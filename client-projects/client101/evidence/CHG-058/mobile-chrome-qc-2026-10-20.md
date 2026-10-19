# Mobile Chrome QC — acceptance rerun

**Date:** 2026-10-20
**Build:** app `3b2026a` (served), API `3b2026a`
**Surface:** `https://buildkart-staging.web.app`
**Method:** headless Chromium via Playwright with the Flutter accessibility tree enabled, so the
checks are real UI interactions (login, navigation, cart, shipping selection), not API calls.
**No order was submitted.**

## Matrix

| Check | 390×844 | 360×800 |
|---|---|---|
| Sign in (email + OTP `123456`) | pass | pass |
| `/#/browse` direct load | pass | pass |
| `/#/browse` after reload | pass | pass |
| `/#/checkout` direct load | pass | pass |
| `/#/checkout` after reload | pass | pass |
| `/#/b2b/catalogue` direct load | pass | pass |
| `/#/b2b/catalogue` after reload | pass | pass |
| Quick-order list names (all four) | pass | pass |
| Default list selected | pass (Electrical Essentials) | pass |
| Trade Offers & Deals visible | pass | pass (after scroll; offscreen semantics culled) |
| Buy Again unit | pass | pass |
| Page-level horizontal overflow | none (390/390) | none (360/360) |
| Console errors / failed requests | none | none |

## Checkout subtotal (CHG-059)

Cart: one Action Tesa HDHMR Board at ₹436.90, `PLY5` auto-applied.

| Row | Before shipping | After selecting Standard Shipping ₹99 |
|---|---|---|
| Subtotal | ₹436.90 | **₹436.90** |
| Discount | −₹21.84 | −₹21.84 |
| Shipping | Calculated at checkout | ₹99 |
| Total | ₹415.05 | ₹514.05 |

The subtotal stays the item amount after shipping is attached, and the total is
`436.90 − 21.84 + 99 = 514.05` (engine-rounded). This is the defect CHG-059 fixed; the old
behaviour showed the shipping-inclusive amount as Subtotal.

## Deep links (CHG-058)

Previously a signed-in full-page load of these routes was replaced by Home. Both a direct load and
a hard reload now stay on the requested route, with the catalogue and checkout content rendered.

## B2B merchandising (CHG-062)

- Four quick-order lists render: Electrical Essentials, Bathroom & Plumbing, Paints & Finishes,
  Tools & Hardware.
- Electrical Essentials is selected on first load.
- Products resolve with real images, prices and MOQ.
- Trade Offers & Deals renders its collections and product lanes.
- Buy Again renders its empty-state copy for this buyer.

## Not covered

- Full checkout completion and payment (deliberately not submitted).
- Promotion correctness (`PLY5` quantity gate, `TOOLS200` fixed amount, trade-customer codes) —
  already tracked separately.
- Human visual sign-off.

Staging only; production remains unauthorized.
