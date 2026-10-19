# Mobile Chrome QC — 2026-10-19

## Result

**Conditional pass.** Normal in-app mobile journeys are usable and visually stable. One P1 routing
defect remains before mobile-web acceptance: an authenticated deep-link refresh is replaced by the
Home route.

This is AI-generated staging evidence and requires human review. No production authorization is
implied.

## Test setup

| Item | Value |
|---|---|
| App | `https://buildkart-staging.web.app` |
| Deployed build marker | `STAGING · 3fa2c1b` |
| Browser | Google Chrome `155.0.8059.82` |
| Primary viewport | 390 × 844, DPR 2, touch enabled |
| Small viewport | 360 × 800, DPR 2, touch enabled |
| Pilot identity | authenticated staging customer fixture |
| Order completion | not performed |

## Journey results

| Journey/check | Result | Evidence observed |
|---|---|---|
| Fresh app entry | Pass | Onboarding fits at 390 px and Get Started is reachable. |
| OTP login | Pass | Email/phone and OTP interaction completed in Chrome. |
| B2C Home | Pass | Hero, Flash Deals and Best Sellers render live catalogue cards. |
| B2C carousel | Pass | Changed from Ease Shopping to Big Savings after ~5.7 s. |
| Browse | Pass | Categories, sort/filter controls, product cards and horizontal rails fit. |
| Search | Pass | `socket` returns matching catalogue products. |
| B2C product detail | Pass | Variant, SKU, seller, selling/list prices and 16% discount render. |
| Cart | Pass with observation | Quantity/remove, promo entry, totals and checkout CTA fit; line thumbnail is a placeholder. |
| Address-first checkout | Pass | Default address, Change/Edit and signed-in contact are visible. |
| Shipping totals | Pass | Standard Shipping changes the total from ₹3,990 to ₹4,089 (₹99 shipping). |
| Checkout submit surface | Pass | Place order is present; no QC order was submitted. |
| B2B Home | Pass | Trade header, hero, quick-order and buy-again states render. |
| B2B carousel | Pass | Hero changed from Big Savings to Free Delivery after ~5.7 s. |
| B2B catalogue | Pass | Live products, discounts, MOQ and 1/10/25 quantity tiers render. |
| B2B product detail | Pass | Two variants and 1+/10+/25+ prices render correctly. |
| 360 px smoke check | Pass | Home and checkout retain usable layout and four-tab navigation. |
| Console errors | Pass | None in the final end-to-end run. |
| Failed/HTTP requests | Pass | None in the final end-to-end run. |
| Page-level horizontal overflow | Pass | Document width remained equal to viewport; rails intentionally scroll horizontally. |

## Finding 1 — P1: authenticated deep links are not preserved

### Reproduction

1. Sign in as the pilot customer.
2. Open a new tab at `https://buildkart-staging.web.app/#/browse` (or refresh that URL).
3. Wait for session restoration.

### Actual

- The hash route is removed.
- The final URL is the app root.
- Home is rendered rather than Browse.
- The same bootstrap behavior can affect Checkout and B2B deep links.

### Expected

The requested valid route remains active after session restoration.

### Cause

`apps/prototype_app/lib/app.dart` restores the session and then unconditionally calls
`router.go('/')` for a customer or `router.go('/b2b')` for a B2B role. It does not first check
whether the router already holds a meaningful requested route.

### Impact

- Shared links and bookmarks appear unreliable.
- Refreshing a product, checkout or catalogue page unexpectedly returns to Home.
- This can be perceived as app instability even though normal in-app navigation works.

### Proposed correction

See `client-projects/client101/changes/CHG-058.yaml`. Preserve valid requested routes and select a
role landing page only from an entry route such as onboarding/login/OTP.

## Finding 2 — P2: cart line thumbnail fallback

The cart line for the tested socket set displayed the generic image placeholder although the same
product has a valid catalogue thumbnail on Home, Browse and PDP. This does not block checkout but
reduces polish and product recognition in the cart. A later change should map the catalogue image
onto the cart line when the cart payload omits its thumbnail.

## Acceptance recommendation

- **In-app mobile journey:** pass for human visual review.
- **Direct-link / refresh behavior:** do not accept until CHG-058 is approved and verified.
- **Production:** remains unauthorized.
