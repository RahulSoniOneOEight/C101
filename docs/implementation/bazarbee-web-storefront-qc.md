# BazarBee web storefront — build and flow QC

Date: 2026-11-19
Branch: `feat/bazarbee-branding`; web release `release-web-20261119-145903`; CMS `ea16cf2`; API `5639fe3`; admin panel `93eeac1`; Flutter code `bd956e2`
Surfaces: `https://gobazarbee.com` (Next.js web store), `https://app-staging.pinakaplay.cloud` (Flutter Web), `https://api-staging.pinakaplay.cloud` (Experience API)
Flutter baseline: `https://app-staging.pinakaplay.cloud` (Flutter Web; Firebase `gobazarbee.com` retired from the Flutter role)
Web release: `/opt/buildkart-releases/release-web-20261119-145903`; admin panel `/opt/buildkart-releases/release-93eeac1`

This record covers the responsive web storefront, email authentication, branding, and the order and
checkout QC. It is staging evidence only; production remains unauthorised.

## 1. What changed

| Area | Change |
|---|---|
| Email auth | Redis-backed six-digit email codes and single-use magic links. Codes are hashed, expire in 10 minutes, allow five attempts, and share a 60-second per-email cooldown. Magic links expire in 15 minutes and are consumed once. |
| Email delivery | Resend sender behind `RESEND_API_KEY`. Without a key, staging returns a preview code/link and never claims an email was sent; production refuses to issue a challenge. |
| Web auth UI | `/sign-in` has Email code and Magic link tabs; `/auth/email` consumes a magic link and issues the HTTP-only session. |
| Storefront | Responsive shell, hero, category taxonomy, catalogue/search, product detail, multi-item cart, quote-backed checkout, confirmation, orders and returns. |
| Branding | Logo 74px desktop / 73px mobile (30.4% larger than the 56px pilot mark), BazarBee colour and type tokens throughout. The 73px lockup also holds at 320px because the mobile header carries only the cart action. |
| Checkout accuracy | `/api/cart/quote` resolves standard delivery for the entered postal code and returns subtotal, automatic offer, shipping and total. The checkout button and confirmation use the server-computed total. |
| Edge routing | Nginx exact-matches `/auth/email` to the web app before the operator `/auth/*` block; Medusa auth remains operator-only. |
| Account & saving | New account hub, device-local wishlist with save-from-card/detail, and a web notifications inbox backed by `/v1/me/notifications` with unread counts and mark-all-read. |
| Trade web slice | Signed-in trade buyers get `/trade` workspace, `/trade/catalogue` (B2B API, MOQ + quantity tiers + add-to-quote), `/trade/credit` (staging fixture), and `/trade/quote` (device-local quotation cart + RFQ draft). Consumer identities get the marketing capability page. |

## 2. Flutter → web feature parity

The Flutter router is the baseline (`apps/prototype_app/lib/router/app_router.dart`).

| Flutter capability | Web status | Notes |
|---|---|---|
| Onboarding | Equivalent landing hero | Not a separate flow on web. |
| Login / OTP | **Parity + improvement** | Email code and magic link replace simulated SMS OTP. |
| Home, product list, product detail | Implemented | Category taxonomy and search added. |
| Search / filter / collections | Implemented | Text search with category filters, sort, a Discover/“Find the right aisle” hub, guided task prompts and brand search. The app's `/search?mode=ai` prompts map to the closest stocked aisle rather than a generative answer. |
| Chat / assistant | Implemented | “Ask BazarBee” drawer uses the same workspace assistant channel as the app, for both household and trade workspaces. It is read-only and persists messages server-side. |
| Cart / checkout / order confirmation | **Parity** | Multi-item cart, server quote, simulated prepaid completion, and a “You may also like” cross-sell rail drawn from the same aisles. |
| Category presentation | **Parity** | Home/category tiles carry CMS banner imagery and inline category icons; the desktop rail and search chips use the same icon set. |
| Recently viewed | Implemented | Customer-local history records product views and renders a “Recently viewed” rail on home and product detail. |
| Orders, order detail, tracking events, returns | Implemented | Tracking lives inside order detail; no standalone `/track` page. |
| Account, profile, addresses, payments, GST invoices, help, settings | Partial+ | Account hub, wishlist and notifications added. Addresses, payment methods, GST invoice history, help/settings and team/roles remain Flutter-only. |
| Wishlist | Implemented | Device-local on web, matching the app's local wishlist provider; badges and save/remove work from cards and product detail. |
| Notifications | Implemented | Real `/v1/me/notifications` inbox with unread count, mark-all-read and deep links into orders. |
| B2B shell: catalogue, credit, quotation cart, quotes, quick order, procurement lists, schemes, price advantage, RFQ | **Partial + explicit descope** | Implemented on web: trade catalogue with MOQ/tier pricing, **Buy at trade rate** into a B2B checkout, credit overview, quotation cart and RFQ draft entry. Remaining app-only: credit payments/limit actions, quote comparison/approvals, projects, procurement lists, team/roles, GST invoice history. |

## 2.1 Flutter B2B and account baseline (QC evidence)

Logged into the Flutter app as the allowlisted B2B identity
`buyer.b2b01@buildkart.test` (pilot OTP `123456`, displayed by the app) and walked the shell:

| Flutter surface | Observed baseline |
|---|---|
| B2B home | Conversations 5, Notifications 30, Cart, Account, trade search, deliver-to `Bhiwadi, Rajasthan 301019`, Quick order, category rail, saved list, buy-again |
| Catalogue | 3 live products, trade rates, MOQ tiers (5/10, 1/10/25, 1/11), Add to order, filters and sort |
| Credit | Available ₹1.72L, sanctioned ₹2L, utilised ₹28,450, overdue ₹59,700, 14% used, 5 invoices |
| Quotation cart | Quotation cart with MOQ chips, Start Request Quotation, order history |
| Account | BuildPro Traders Pvt Ltd, GSTIN 27ABCDE1234F1Z5, Team & Roles, Credit Overview, My Price Advantage, RFQ Basket, Projects & Sites, GST Invoices, Order History, Approvals, Switch to consumer |
| Trade / Browse tabs | Both resolve to the trade catalogue; Trade carries the conversation dock |

**Web disposition:** the first trade slice is implemented against the live B2B API:

| Web trade surface | Evidence |
|---|---|
| `/trade` workspace | Gated by the server-owned `b2b_buyer` role; shows Arjun Traders, catalogue/credit/quote links and the scope boundary |
| `/trade/catalogue` | 3 B2B products, MOQ 5/1/1, tiers `5–9 ₹3,890` / `10+ ₹3,790`; add-to-quote defaults to MOQ |
| `/trade/credit` | Available ₹1,71,550, sanctioned ₹2,00,000, utilised ₹28,450, overdue ₹59,700; explicitly labelled staging fixture |
| `/trade/quote` | Quantity-tier pricing, MOQ enforcement, delivery/required-by/remarks, RFQ reference; saved on device, no seller message/order/payment |
| D2C gating | A consumer session sees the capability page and “trade account required” on catalogue/credit, not fake trade data |

Remaining B2B modules are explicitly app-only: credit payments/limit actions, quotation
comparison/approvals, projects, procurement lists, schemes/price advantage, team/roles and GST
invoice history. The account hub covers orders, returns, wishlist, notifications and cart; addresses,
payment methods, GST invoice history, help/settings and team/roles remain app-only.

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

## 3.1 Account, wishlist and notification QC

| Test | Result |
|---|---|
| Signed-out `/account` | Redirects to `/sign-in?next=%2Faccount` |
| Signed-out `/notifications` | Redirects to `/sign-in?next=%2Fnotifications` |
| Signed-in account hub | Shows the signed-in email, orders/returns/wishlist/notifications/cart/trade links and sign-out |
| Notification inbox | 14 items for the D2C test identity and 30 for the B2B test identity; unread count matches the header badge |
| Notification deep link | Opens the linked owner-scoped order detail |
| Wishlist save | Heart on a catalogue card stores the product; `/wishlist` shows it with price, seller and Add to cart |
| Mobile layout | Account, notifications, wishlist and trade pages have no horizontal overflow at 390px |
| Trade entry | `/trade` renders the B2B workspace for a trade role and the capability map for a consumer; no fake credit or RFQ data is shown |
| Live staging smoke | `/account`, `/notifications`, `/trade`, `/wishlist` all `200` at 1440px with no page errors; wishlist save renders one card |
| Expired session | Invalid cookie on `/account` and `/notifications` now redirects to `/sign-in?next=…` instead of rendering a signed-in shell with a load error |

## 3.2 Trade slice QC

| Test | Result |
|---|---|
| B2B role gate | `b2b_buyer` from `/v1/me/contexts` opens the workspace; a D2C session sees the capability page and “trade account required” |
| Trade catalogue | 3 products from `/v1/products?channel=b2b`, MOQ 5/1/1, tiers `5–9 ₹3,890`, `10+ ₹3,790`, `1–10 ₹1,45,000`, etc. |
| Tier application | Default MOQ 5 → ₹3,890/unit, ₹19,450; quantity 10 → ₹3,790/unit, ₹37,900 |
| Add to quote | Card action stores the line; `/trade/quote` shows MOQ, tier rate, quantity and line total |
| RFQ entry | Delivery, required-by and remarks; creates `RFQ-####`; status “Saved on this device · not sent to sellers”; no order/payment |
| Credit overview | ₹1,71,550 available / ₹2,00,000 sanctioned / ₹28,450 utilised / ₹59,700 overdue; 2 of 5 invoices shown; explicit staging-fixture banner |
| Mobile | 320/390px no horizontal overflow; 73px logo visible with only the cart action in the header |

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
| Header logo | 74px desktop, 73px mobile; +30.4% vs the previous 56px; 73px still fits at 320px |
| Mobile sticky header | 92px with the 73px lockup (the search bar sits below the sticky row) |
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

After the account, wishlist, notifications and trade screens shipped, the approved vision pass
(Nemotron 3.5 Super VL) reviewed eight live desktop/mobile screenshots. It found one P1: the
notifications page could show a signed-in shell and a session error together after expiry. The
page now redirects on `401/403`, and the re-check returned **no P0/P1 issues and a "ship" verdict**.

The web trade slice then received a dedicated visual pass across desktop and 320/390/430px mobile:
MOQ/tier tables, 73px mobile logo, RFQ confirmation and the credit overview. The verdict was
**ship, no P0/P1 issues**. A follow-up pass on the final header (73px at 320px, cart-only) also
returned **ship**.

## 7. Known limitations

- Real email delivery needs `RESEND_API_KEY` and a verified `send.gobazarbee.com` sender in the
  staging secret store.
- The media crop editor manages focal-point cropping with desktop/mobile previews; file-level
  media-library crop variants remain a future storage upgrade.
- The Flutter welcome renderer is built and verified locally; publishing to `gobazarbee.com` is
  blocked until Firebase CLI authentication is available (`firebase login` or `FIREBASE_TOKEN`).
- Banner Studio searches category, product and collection references; product/collection queries load
  the first 100 products and all collections, so a very large catalogue needs server-side search.
- hi-IN content is authored and published through Banner Studio (`ea16cf2`). Six legacy category
  editorials keyed by a category label were skipped by the `pcat_` validator; the canonical
  category records are localized. Some static B2B nav/footer strings remain English.
- Quotes create a short-lived Medusa cart per quote. This is acceptable for staging; production
  should reuse the checkout cart.
- Catalogue is the staging set (30 products), including test products with unrelated imagery.
- The web trade slice covers catalogue/MOQ/tier pricing, add-to-quote, credit overview and RFQ draft
  entry. Credit payments/limit actions, quote comparison/approvals, projects, procurement lists,
  schemes/price advantage, team/roles and GST invoice history remain Flutter-only.
- Credit values are a staging fixture mirroring the Flutter demo, not a live ledger. RFQ drafts are
  device-local and are not sent to sellers.
- Address book, payment methods, GST invoice history, help and settings remain app-only.
- The web wishlist is device-local (matching the app's local provider), not account-synced.
- Staging is `noindex, nofollow` and uses synthetic data. Production still requires CHG-020 gates and
  D-020-12 release authorisation.

## 8. Final merchandising and admin QC — 19 Nov 2026

Web release `36fae92`; CMS `ea16cf2`; API `5639fe3`; admin panel `93eeac1`. CMS presentation data drives the B2C and B2B surfaces below.

| Surface | Result |
|---|---|
| B2C home, 1440px | CMS hero “Build more. Buy better.”, campaign strip, desktop category rail (All products + 10 categories), 8 populated category tiles, Flash Deals and Recommended rails; hero CTA `/search` with `utm_source=web&utm_medium=banner&utm_campaign=banner-welcome-en-in` |
| B2C category rail | 11 links (All products + 10 categories); last link visible; rail `scrollWidth = clientWidth = 1360`; Electrical opens `/search?cat=lighting-electrical` with 2 products; rail remains visible on search and hidden on checkout |
| B2C Electrical | Category tile opens `/search?cat=lighting-electrical`; banner 1, products 2 |
| B2C Tools & Hardware | Banner 1, chips 11, products 4 |
| B2C checkout | Fresh email-code session → add to cart → quote `₹3,990 − ₹199.50 + ₹99 = ₹3,889.50`; latest order `BK-261119-ARC9HJ`, simulated prepaid, 1 item (earlier `2ZVH8R`, `4S660H`) |
| hi-IN B2C | `html lang=hi-IN`; hero “ज़्यादा बनाएं। बेहतर खरीदें।”, 10 Hindi categories and rail; section labels “श्रेणी से खरीदें”, “फ्लैश डील्स”, “आपके लिए सुझाए गए”; locale switch returns English |
| hi-IN category | Electrical rail link → `इलेक्ट्रिकल`, 2 products |
| hi-IN checkout | Same quote `₹3,889.50`; order `BK-261119-4S660H` simulated prepaid, 1 item |
| hi-IN B2B | “आपका ट्रेड डेस्क, अब वेब पर।” hero, 4 offer cards, `औज़ार और हार्डवेयर` category with banner and 1 product |
| CMS hi-IN authoring | Banner Studio hi-IN list shows 24 banners; banner and category draft→publish works without changing the en-IN title; canonical 10 categories localized per channel |
| Delivery note | Action Tesa search tile shows “Standard delivery · 1–3 business days” from authored product metadata |
| B2B quick order | `/trade/quick-order`: 4 trade lines, SKU filter “socket” → 1 line, Add to quote → quotation cart ₹350 |
| B2B buy again | Quick-order and `/trade` show a buy-again section sourced from the buyer's owner-scoped order lines |
| Flutter B2C welcome | Onboarding renders branded `b2c-welcome-mobile-branded.webp`; presentation API HTTP 200; image HTTP 200 |
| Flutter B2B welcome | Login B2B tab renders `b2b-welcome-mobile.webp`; presentation API HTTP 200; image HTTP 200 |
| Flutter build | `flutter analyze` no issues; `flutter build web --release` built `build\web`; local release serve verified |
| Product Studio delivery note | Action Tesa Product Studio shows `Standard delivery · 1–3 business days` from product metadata |
| Media crop editor | Banner Studio shows desktop/mobile previews and 9 focal cells; selecting top-left updates the focal field to `Top left` |
| B2C order history | Earlier runs created `BK-261119-D35FDW` and `BK-261119-QFEJWX` at ₹3,889.50 |
| B2C welcome | `b2c.welcome.banner` renders on `/sign-in` |
| B2B home | “Your trade desk, on the web.” hero, 3 trade-offer cards, credit ₹1,71,550; hero CTA “Open trade catalogue” → `/trade/catalogue?utm_source=web&utm_medium=banner&utm_campaign=b2b-banner-welcome-en-in`; category rail absent |
| B2B quote | Add to quote → 1 line, quantity 5, estimated value ₹19,450 |
| B2B Tools | Banner 1, products 1 |
| B2B welcome | `b2b.welcome.banner` renders on `/sign-in?next=/trade` |
| Mobile category rail | Hidden at 390px (`count 1`, `visible false`); scroll width remains 390 |
| Focal point | B2B hero saved as `imageFocalPoint=bottom`; API returns `image_focal_point=bottom`; web computed `object-position: 50% 100%` |
| hi-IN | `/v1/content/presentation?locale=hi-IN` returns 4 B2C / 2 B2B banners and 10 categories; English content is the fallback because no hi-IN records are published |
| Publish rollback | `hero-monsoon-ready` unpublish `200` → B2C delivery 4→3 banners without the hero; republish `200` → 3→4 banners; `ROLLBACK_OK` |
| Mobile 390px | B2C home, B2C Tools, B2B home and B2B Tools all report `scrollWidth = innerWidth = 390`; no horizontal overflow |
| Runtime errors | No page errors on the B2C or B2B runs |

Admin Banner Studio, signed in as the staging operator:

| Check | Result |
|---|---|
| Placement coverage | 7 tiles: B2C/B2B home, campaign, category and welcome; B2C home shows 2 active campaigns, category placements show 9 categories each |
| Full-page preview | Welcome/home/category context at App, Mobile web and Desktop; current draft banner plus the published page shell |
| CTA mapping | `App route` and `Web path` fields present; web path wins on the web store |
| Web overrides | Web heading, supporting text and button-label fields present |
| Focal point | Select renders with the saved value `Bottom` |
| Searchable category picker | Switching destination type to Category reference exposes a datalist with 10 commerce categories |
| Searchable product picker | Product reference loads 100 admin products from `/admin/products?limit=100` |
| Searchable collection picker | Collection reference loads 5 collections from `/admin/collections` |
| CTA validation | An invalid product id is rejected with the `prod_` prefix message before publish |
| Errors | None |

The approved vision pass (Nemotron 3.5 Super VL) reviewed the live B2C home/campaign/category,
B2B hero/category and 390px captures: **ship, no P0/P1**. Consecutive automated email-code requests
hit the documented 60-second cooldown during earlier passes; fresh code sign-in completed both the
B2C order and the B2B flow. A deliberately expired D2C cookie produced an unquoted fallback cart;
re-authenticating restored the quote, offer, delivery and order, so the fallback is an auth-expiry
state rather than a pricing defect.

## 9. Host cutover — 19 Nov 2026

The web and Flutter hosts were swapped:

| Host | Before | After |
|---|---|---|
| `gobazarbee.com` | Firebase-hosted Flutter Web | Next.js B2C/B2B store (`PUBLIC_APP_HOSTNAME=gobazarbee.com`) |
| `app-staging.pinakaplay.cloud` | Next.js store | Flutter Web static container `buildkart-flutter` |
| `www.gobazarbee.com` | Firebase | 308 redirect to `https://gobazarbee.com/` |

Post-swap evidence:

| Check | Result |
|---|---|
| Root DNS | `gobazarbee.com` and `www` → `89.116.20.164` |
| Next.js home | `Build more. Buy better.`, 8 categories, campaign strip; no failed requests; no horizontal overflow |
| Next.js category | Tools & Hardware, 4 products |
| Next.js checkout | Quote `₹3,890 − ₹199.50 + ₹99 = ₹3,889.50`; order `BK-261119-BSCDR4` confirmed |
| B2B root domain | Signed in as `buyer.b2b01@buildkart.test`; hero, 4 offers; Tools banner + 1 product |
| Flutter at app-staging | Onboarding loads, branded welcome image HTTP 200, title `BazarBee` |
| Flutter `/branding` CORS | `Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin` |
| `www` | `308 Permanent Redirect` → `https://gobazarbee.com/` |
| TLS | Both root and app-staging served over HTTPS |

Earlier sections of this QC record were captured on `app-staging` before the swap; they remain valid
for the application behavior, while the live hosts are now the ones above.

## 10. App-parity merchandising and assistant QC — 19 Nov 2026

Added `/discover`, category imagery/icons, cart cross-sell, recently viewed, the “Ask BazarBee”
workspace drawer and B2B trade-rate checkout. Full change record:
`docs/implementation/webstore-app-parity-2026-11-19.md`.

| Check | Result |
|---|---|
| Home categories | 8 CMS tiles; 8 banner images; 8 inline SVG icons; discovery band present |
| Desktop rail | 12 links (Discover + All products + 10 categories), `scrollWidth = clientWidth = 1360` at 1440px after the icon fit fix |
| Discover | 8 category cards, 4 guided task cards, 5 seller brands; no overflow at 1440 or 390 |
| Guided search | “Paint a room” → Paints & Finishes, 6 products, guided panel names the matched aisle |
| Seller search | “UrbanBuild Supply” → 11 products |
| Cart cross-sell | 4 “You may also like” products from the cart's aisles |
| Recently viewed | product view wrote `["prod_01M59JHKBZ41EJTYW3X6MCXZC6"]`; home rendered 1 card |
| B2C chat | Household project “Rohan's Home”; tabs Assistant / Project chat; Project chat loaded 19 persisted messages; assistant replied to “What can you do?” |
| B2B chat | Trade workspace “Arjun Traders Procurement”; tabs Assistant / Procurement; Procurement loaded 33 persisted messages; assistant replied |
| Mobile 390 | Home and Discover `scrollWidth = innerWidth = 390`; chat launcher visible |
| B2C order | `BK-261119-KCQJ60`, `₹3,889.50`, simulated prepaid; cart metadata `channel=b2c` |
| B2B order | `BK-261119-PTPF1G`, `₹18,576.50`; cart metadata `channel=b2b`, `business_account_id=business_arjun_traders` |
| B2B line | 5 × ₹3,890 tier price = ₹19,450; automatic offer −₹972.50; delivery ₹99; total ₹18,576.50 |

B2B pricing defect found and corrected during this pass: six `BuildKart B2B Studio` price-list rows
were stored 100× low, so the first B2B checkout (`BK-261119-MAM41J`) completed at ₹283.77. The rows
were corrected, the quote and order were re-run, and the corrected order above is the acceptance
evidence. See `b2b-price-unit-correction-2026-11-19.md`.

ChatGPT-hosted QC was not available: `https://chatgpt.com/` returned a Cloudflare challenge and this
environment has no OpenAI API key or authenticated ChatGPT browser session. The checks above are a
scripted Playwright QC instead; this is recorded as a limitation, not a completed ChatGPT review.

## 11. Category lanes and policy pages — 19 Nov 2026

### 11.1 Category lanes

| Check | Result |
|---|---|
| B2C home | “Shop by category” is one lane: 8 cards, `scrollWidth 2502` / `clientWidth 1232` at 1440px |
| B2B home | One “Shop by category” lane across the full 10-category catalogue; `scrollWidth 3130` / `clientWidth 1232`; counts show active trade terms |
| B2B catalogue | Category selector `flex-wrap: nowrap`; `scrollWidth 1497` / `clientWidth 1232` |
| Mobile | B2C lane `scrollWidth 2660` / `clientWidth 358`; page overflow `390 = 390` |

### 11.2 Policy pages

| Route | Live result |
|---|---|
| `/terms` | 200, draft notice, no placeholders |
| `/refunds` | 200, draft notice, 2 tables, no placeholders |
| `/shipping` | 200, draft notice, 1 table, no placeholders |
| `/privacy` | 200, draft notice, 3 tables, no placeholders |
| `/contact` | 200, draft notice, 3 tables, no placeholders |
| `/about` | 200, draft notice, no placeholders |
| `/policies` | 200, 6 policy cards |
| Footer | 7 policy links (six policies + All policies) |
| Robots | `X-Robots-Tag: noindex, nofollow` |

The policy pack is still a **draft**. Pages withhold the unverified GSTIN, mark the refund timeline as
proposed and show a “Draft for review — not yet effective” notice. Publishing as final terms requires
the legal/GSTIN/support-mailbox gates in `policy-pages-2026-11-19.md` and `POLICIES_APPROVED=true` at
build time.


