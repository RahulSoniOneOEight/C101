# BazarBee web storefront — build and flow QC

Date: 2026-11-19
Branch: `feat/bazarbee-branding` (deployed web code `8860031`; later commits are documentation only)
Surfaces: `https://app-staging.pinakaplay.cloud` (Next.js), `https://api-staging.pinakaplay.cloud` (Experience API)
Flutter baseline: `https://gobazarbee.com` (`buildkart-staging` Firebase site)
Web release: `/opt/buildkart-releases/release-8860031`; Experience API image built from `release-4efabb0`

This record covers the responsive web storefront, email authentication, branding, and the order and
checkout QC. It is staging evidence only; production remains unauthorised.

## 1. What changed

| Area | Change |
|---|---|
| Email auth | Redis-backed six-digit email codes and single-use magic links. Codes are hashed, expire in 10 minutes, allow five attempts, and share a 60-second per-email cooldown. Magic links expire in 15 minutes and are consumed once. |
| Email delivery | Resend sender behind `RESEND_API_KEY`. Without a key, staging returns a preview code/link and never claims an email was sent; production refuses to issue a challenge. |
| Web auth UI | `/sign-in` has Email code and Magic link tabs; `/auth/email` consumes a magic link and issues the HTTP-only session. |
| Storefront | Responsive shell, hero, category taxonomy, catalogue/search, product detail, multi-item cart, quote-backed checkout, confirmation, orders and returns. |
| Branding | Logo 74px desktop / 62px mobile (30% larger than the 56px pilot mark), BazarBee colour and type tokens throughout. |
| Checkout accuracy | `/api/cart/quote` resolves standard delivery for the entered postal code and returns subtotal, automatic offer, shipping and total. The checkout button and confirmation use the server-computed total. |
| Edge routing | Nginx exact-matches `/auth/email` to the web app before the operator `/auth/*` block; Medusa auth remains operator-only. |

## 2. Flutter → web feature parity

The Flutter router is the baseline (`apps/prototype_app/lib/router/app_router.dart`).

| Flutter capability | Web status | Notes |
|---|---|---|
| Onboarding | Equivalent landing hero | Not a separate flow on web. |
| Login / OTP | **Parity + improvement** | Email code and magic link replace simulated SMS OTP. |
| Home, product list, product detail | Implemented | Category taxonomy and search added. |
| Search / filter / collections | Partial | Text search, category filters and sort; no discovery hub, AI search mode or collection pages. |
| Cart / checkout / order confirmation | **Parity** | Multi-item cart, server quote, simulated prepaid completion. |
| Orders, order detail, tracking events, returns | Implemented | Tracking lives inside order detail; no standalone `/track` page. |
| Account, profile, addresses, payments, GST invoices, help, settings | Partial | Sign-in, orders and returns only. |
| Wishlist | Not implemented | Candidate next slice. |
| Notifications | Not implemented | Existing API inbox is not surfaced on web. |
| B2B shell: catalogue, credit, quotation cart, quotes, quick order, procurement lists, schemes, price advantage, RFQ | Not implemented | The web store covers the D2C journey; B2B remains Flutter-only. This is the largest parity gap. |

## 3. Authentication QC

| Test | Result |
|---|---|
| Request email code for an allowlisted user | `201`, challenge id and staging preview code returned |
| Verify six-digit code | `200`, session issued, `/v1/me/orders` reachable |
| Wrong six-digit code | `401 invalid-email-code` |
| Immediate repeat request | `429 email-cooldown` |
| Magic-link request | `201`, single-use link with 15-minute TTL |
| Magic-link consumption | `200`, session issued |
| Magic-link reuse | `401 invalid-magic-link` |
| Non-allowlisted email | `403 not-pilot-user` |

Staging has no `RESEND_API_KEY`, so the delivered code/link is shown in the UI as a clearly marked
preview. A production deployment must supply a Resend key; the API fails closed without one.

## 4. Order and checkout QC

| Test | Result |
|---|---|
| Email-code UI sign-in → add product → checkout | Session redirect to `/checkout`, cart preserved |
| Quote for one board (postal code 302001) | Subtotal ₹436.90, automatic offer −₹21.85, delivery ₹99, **total ₹514.05** |
| Place order | Canonical order `BK-261118-5GXWN0`, simulated payment, **total paid ₹514.05** |
| Final confirmation-step check | Order `BK-261118-H032DZ`, total ₹514.05, step 3 marked current |
| Quote vs completion | Exact match |
| Multi-line API checkout | Two offers in one cart completed as one order group |
| Delivery resolution | Cart-level Standard tier selected for every seller group |
| Quote failure path | Checkout falls back to "At confirmation" and does not show a false total |
| Orders after completion | New order visible in the owner-scoped order list |

The earlier cart showed only the item subtotal while the server also applied a 5% automatic offer and
₹99 delivery. That mismatch is fixed: the checkout summary and submit button now use the quote, and
the confirmation shows the server's `total_minor`.

## 5. Responsive and accessibility QC

Measured with Playwright at 320, 390, 430 and 1440 px.

| Check | Result |
|---|---|
| Horizontal overflow | None at 320/390/430/1440 |
| Header logo | 74px desktop, 62px mobile; +30% vs the previous 56px |
| Mobile sticky header | 81px (was 141px before the search bar was moved out of the sticky area) |
| Mobile tab bar | Shop / Search / Cart / Account; 44px minimum tap targets |
| Contrast | All sampled text ≥ 5.55:1; stock status darkened to 6.1:1 |
| Checkout CTA vs fixed tab bar | No overlap after `scroll-padding-bottom` |
| Auth card width | 560px on desktop |
| Product micro-type | Category, badge and struck price lifted to 12px minimum |
| Cart quantity controls | 44px targets on mobile |

## 6. Visual QC

DeepSeek V4 Pro was requested for the visual pass. In this environment it does not accept image
input, so it reviewed the measured DOM/contrast/tap-target audit instead (no pixel claims). An
independent vision pass (Nemotron 3.5 Super VL) reviewed the screenshots; the final pass returned
**no P0/P1 issues and a "ship" verdict**. Findings and dispositions:

| Finding | Disposition |
|---|---|
| Cart did not show delivery or discount before checkout | Fixed with the server quote and accurate button/confirmation totals. |
| OTP field showed `000000` placeholder, looking pre-filled | Placeholder removed. |
| Hero headline could orphan a word at some widths | `text-wrap: balance` applied. |
| Cart Remove and mobile stepper targets under 44px | Raised to 44px. |
| Mobile sticky header consumed 141px | Search moved below the sticky header; 81px sticky row. |
| Product micro-type 9.5–11px | Floor raised to 12px. |
| "Warranty badge overlaps the photo" | False positive: the seal is part of the supplier's product image. |
| Category tiles use different tints | Intentional brand colour coding; kept. |

Final vision pass also confirmed the step-3 confirmation, the ₹514.05 total and the BazarBee
hierarchy across desktop and mobile.

## 7. Known limitations

- Real email delivery needs `RESEND_API_KEY` and a verified `send.gobazarbee.com` sender in the
  staging secret store.
- Quotes create a short-lived Medusa cart per quote. This is acceptable for staging; production
  should reuse the checkout cart.
- Catalogue is the staging set (30 products), including test products with unrelated imagery.
- B2B, wishlist, notifications, profile/address book and GST invoice history remain Flutter-only.
- Staging is `noindex, nofollow` and uses synthetic data. Production still requires CHG-020 gates and
  D-020-12 release authorisation.
