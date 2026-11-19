# B2C product tiles, welcome, login and OTP — design review

Date: 2026-11-19
Surface: Flutter app (`https://gobazarbee.com`)
Sources: `lib/widgets/cart_product_card.dart`, `packages/agency_flutter_ui/lib/agency_flutter_ui.dart`,
`lib/screens/product_list_screen.dart`, `lib/screens/d2c_shell.dart`,
`lib/screens/b2c_flow_screens.dart`; live screens at 390px and 1440px.

The staging banner (`STAGING · bazarbee-brand4`) is a build artefact, not part of the reviewed design.

## 1. Product tile anatomy

The B2C card is `CartProductCard` → `ProductCard`. Two variants are used:

- `compact`: home merchandising rails (Flash Deals, Best Sellers).
- `large`: Home “Browse Categories” grid and Browse/category grid.

### Structure

| Layer | Detail |
|---|---|
| Surface | Card, 8px padding, clipped image, rounded image corners |
| Image | `BoxFit.contain` on a tinted surface, network image with placeholder on error |
| Badges | Top-left, max 2 + `+N`; colour by label (deal/clear/sale/flash = promotion, new = primary, premium = warning, other = trust) |
| Wishlist | Top-right 44×44 translucent circular heart, filled when saved |
| Add / quantity | Bottom-right 44×44 cart-plus; becomes a compact stepper once that exact variant is in the cart |
| Brand | 11px secondary, one line |
| Title | 13px compact / 14px large, semibold, **one line only** |
| Price | 18px compact / 20px large, one line |
| Discount | Promotion pill next to the price |
| MRP | 11px struck-through line below the price, only when a real MRP exists |
| States | loading (progress card), failure (“Product unavailable”), out of stock (tap/add disabled) |

### Live observations

- At 1440px the Home Flash Deals rail shows **8 cards across**; the cards are about 140px wide.
- Long hardware names truncate to one line: “Single Lever Basin M…”, “1 Light Diamond Cut…”,
  “Apol… Premium Sa…”, “1/2in Drive 24 Pcs S…”.
- At 390px Browse uses a two-column grid. “Action Tesa HDHMR B…” loses the board size from the title.
- The add button sits over the product photo (bottom-right) and the wishlist heart over the top-right.
  On the HDHMR board the add button covers part of the warranty seal; on the tyre it covers tread detail.
- Brand strings are lower-case (`asianpaints`, `homerun`, `jktyre`) while headings are title-case.
- Price hierarchy is clear: selling price first, discount pill, struck MRP underneath.
- No rating, review count or delivery note appears on the card even though the widget accepts all three.
- Out-of-stock cards have no visible “Out of stock” label; only the add control becomes unavailable.

## 2. Product tile findings

| Severity | Finding | Recommendation |
|---|---|---|
| **P1** | One-line title truncation makes similar SKUs indistinguishable, especially on mobile (“Action Tesa HDHMR B…”). | Allow 2 lines on large/mobile cards and 1 line only in compact rails; keep a fixed card height. |
| **P1** | Desktop rails are too dense: 8 cards across at 1440px with 11–13px type. | Cap the rail to 5–6 cards on desktop, or use a wider card with a peek of the next item. |
| **P2** | Add and wishlist controls overlay the product image and can hide product detail. | Keep the heart as an overlay; move “Add” to a footer row or a pill below the price on large cards. |
| **P2** | Out-of-stock state is not legible. | Add a visible “Out of stock” badge/overlay and a disabled “Out of stock” label on the CTA. |
| **P2** | `rating`, `reviewCount` and `deliveryNote` are accepted but never rendered. | Render rating/review and delivery/stock notes, or remove the unused fields to avoid a false contract. |
| **P2** | Badge overflow is a `+N` pill with no affordance. | Cap compact cards to one badge; show the full badge set on the PDP. |
| **P2** | Brand casing is inconsistent and visually weak. | Normalise brand display names (or use brand logos) and keep one consistent style. |
| **P2** | Multi-variant products show only a plus; the card gives no hint that a variant sheet will open. | Add an “N options” label or a small variant hint. |
| **P2** | Card semantics announce only title and price. | Include discount, stock and action in the semantic label. |

## 3. Welcome screen

Anatomy: 72px app icon, headline “Everything you need, delivered to your site.”, supporting copy,
three benefit rows (40px icon + 14px title + 12px text), full-width 52px “Get Started” anchored at
the bottom.

What works: clear value proposition, good mobile rhythm, benefit icons scan quickly, CTA is obvious.

| Severity | Finding | Recommendation |
|---|---|---|
| **P1** | Desktop is not composed: the content spans the full 1440px, benefits sit at the far left while the headline is centred, leaving a huge empty middle and a 1,374px-wide CTA. | Constrain the welcome column to ~420–480px and centre it, or use a two-column desktop layout with brand art. |
| **P1** | No guest path. “Get Started” forces login before any catalogue browsing. | Add “Browse without signing in” or let the catalogue open and gate only cart/checkout. |
| **P2** | Brand shows only the 72px app icon; no BazarBee wordmark. | Use the full logo lockup on the welcome screen; keep the icon for the app launcher. |
| **P2** | “Get Started” leads to “Welcome back”, conflating new and returning users. | Rename to “Continue” or add a secondary “Already have an account? Sign in”. |
| **P1 (production gate)** | No terms/privacy links. | Add legal links and consent copy before production. |

## 4. Login screen

Anatomy: white logo card (42px logo), Consumer D2C / B2B Trade segmented control, “Welcome back”
(B2C) or “B2B Trade Portal Sign-In” plus explanatory copy, “Pilot email or 10-digit phone” field,
full-width “Get OTP”, and a B2B-only trust line (“No lengthy forms…”).

| Severity | Finding | Recommendation |
|---|---|---|
| **P1** | Desktop controls stretch to 1,374px; the form has no card or max-width and leaves most of the screen empty. | Use a centred 420–480px auth card, or a 40/60 brand + form split on desktop. |
| **P1** | No back or skip path; `context.go('/login')` replaces the welcome route. | Add a back affordance and a guest/skip action. |
| **P1** | Input is not validated: empty or malformed input is sent, any non-`@` string gets `+91`, and the keyboard is always `emailAddress`. | Validate email vs 10-digit phone inline, set the right keyboard/autofill, and disable the CTA until valid. |
| **P1** | B2B copy says “Enter your phone”, while the field says “Pilot email or 10-digit phone”. | Make the B2B copy match the accepted identifier, or split email/phone modes. |
| **P2** | Errors surface only in a SnackBar (“Login failed: …”). | Put a persistent inline error above the CTA with a recovery hint. |
| **P2** | B2C has no supporting copy under “Welcome back”. | Add a one-line explanation of the OTP sign-in and what the account unlocks. |
| **P1 (production gate)** | No terms/privacy or help link. | Add legal and support links. |

## 5. OTP screen

Anatomy: AppBar “Verify OTP”, copy “Enter the 6-digit code (pilot test code: 123456)”, centred
six-bullet field, “Resend code in 00:28”, full-width “Verify”.

| Severity | Finding | Recommendation |
|---|---|---|
| **P0 (production gate)** | The pilot code is printed on screen. | Hide it outside staging; remove before any production build. |
| **P1** | “Resend code in 00:28” is a hard-coded string; there is no countdown or resend action. | Implement a real timer and enable a resend button at zero. |
| **P1** | No “Change email/phone” and no back arrow (the route replaces the stack). | Show the destination identifier, add “Change” and a back action. |
| **P1** | Desktop layout is the same full-width mobile column. | Apply the same auth card/max-width treatment as login. |
| **P2** | No OTP expiry or “sent to …” context. | Add “Sent to r…@gmail.com · expires in 10 minutes”. |
| **P2** | Errors only via SnackBar; no inline error or retry state. | Add an inline error and keep the field focused. |
| **P2** | No auto-submit/paste-specific handling. | Support paste and submit on the sixth digit. |

## 6. Cross-cutting notes

- **Auth model:** the app still uses the simulated “Get OTP” flow with a visible pilot code. The shared
  Experience API now supports email codes and magic links, but the Flutter login/OTP screens have not
  adopted them. This is the largest auth parity gap.
- **Desktop:** welcome, login and OTP are mobile layouts stretched to 1440px. The B2C Browse banner is
  also very tall on desktop, and the category rail squeezes 11 items into one row; “Miscellaneous”
  breaks as “Miscellaneo us”.
- **Mobile:** welcome, login and OTP are clean and readable; Browse cards are legible but titles lose
  too much information.
- **Production readiness:** remove the staging strip; remove the visible test code; add legal links;
  add a guest path or make the sign-in requirement explicit.

## 7. Web store implications

The responsive web store already does several things differently and better:

- Product cards allow two-line titles, use a card footer for actions, and do not overlay “Add” on the
  image.
- Auth is a centred card with email code and magic-link options, inline errors and a back path.
- Desktop layouts are max-width constrained.

The web store should keep those choices while adopting the app’s stronger merchandising signals:
badge taxonomy, clear price/MRP/discount hierarchy, and the “recently viewed”/Flash/Best rails.
