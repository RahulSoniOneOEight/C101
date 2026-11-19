# B2C + B2B storefront merchandising — implementation plan

Date: 2026-11-19
Status: implementation-ready; parts already shipped, remaining work is broken into MERCH work items.
Scope: Flutter app customer surfaces, admin console controls, and the responsive Next.js web store.
Source of truth: published CMS records + Experience API composition; the app and web store must render,
not re-author, the same records.

Related review: `docs/implementation/b2c-tiles-welcome-login-review.md`

## Plan conventions

| Term | Meaning |
|---|---|
| Work item | `MERCH-xx`, independently reviewable change |
| Owner | Admin/Platform, Experience API, Web, Design/Ops, QA |
| Done | Code + admin preview + published staging evidence |
| P0 | Blocks web parity or can publish a broken customer surface |
| P1 | Required for the first production-shaped release |
| P2 | Follow-up polish or scale |

If a decision is not made before implementation, use the **recommended default** in section 9 and
record the deviation.

## Current implementation status

| Area | Status | Note |
|---|---|---|
| Responsive web D2C storefront | Shipped | CMS-driven hero, campaign strip, category rail, categories, Flash Deals and Recommended sections; branded desktop/mobile art. |
| Web B2B trade slice | Shipped | Catalogue + MOQ/tiers + credit + RFQ; CMS-driven trade hero and category banners. |
| Web channel switch | Shipped (`570bbb6`) | Default B2C; signed-in trade users can switch Shop ↔ Trade; mobile switch via trade nav/account. |
| Account, wishlist, notifications | Shipped | Web account hub and API inbox live. |
| Admin Banner Studio | Updated (`93eeac1`) | Responsive mobile/tablet/desktop URL fields, image focal point with visual 3×3 crop editor, B2C/B2B welcome placements, surface CTA, searchable references, web copy overrides, full-page preview and coverage matrix. |
| Storefront layouts | Existing | B2C/B2B sections, collection source, order, visibility, validation. |
| Category presentation / collections | Existing | Category editorial and curated collections; live categories now drive web tiles and chips. |
| Product Studio | Updated (`93eeac1`) | Product, media, tags, offers, B2B price/MOQ/tiers and a delivery-note field persisted to product metadata. |
| CMS-driven web banners/sections | **Implemented (B2C + B2B)** | B2C hero, campaign, categories, Flash Deals, Recommended; B2B hero, category and trade-offer rail. B2B buy-again/quick-order rails remain out of this slice. |
| Responsive banner variants + CTA mapping | **Implemented** | Desktop/tablet/mobile URL fields, focal point (`imageFocalPoint`), `ctaAppRoute`/`ctaWebPath`, delivery mapping, picture sources, branded assets and validation. Category, product and collection references are searchable; product/category/collection ids are prefix-validated on publish. |
| Image focal point | **Implemented (`5639fe3`)** | Nine focal points in CMS/admin, delivered as `image_focal_point`; web applies `object-position` to hero, campaign, welcome and trade images. |
| Welcome banners | **Implemented web + Flutter (`bd956e2`)** | `b2c.welcome.banner` / `b2b.welcome.banner` placements drive web sign-in, Flutter onboarding and Flutter login. Flutter web build verified; Firebase hosting release awaits authentication. |
| Web copy overrides + attribution | **Implemented** | `webTitle` / `webSubtitle` / `webCtaLabel` override app copy on web; internal campaign links carry `utm_source=web`, `utm_medium=banner`, `utm_campaign=<content key>`. |
| hi-IN locale + content | **Implemented (`d451153`)** | Header `EN / हिं` switch stores `bazarbee_locale`; layout, home, search, sign-in and trade pages pass the locale to CMS. Hindi copy is authored and published through Banner Studio for 24 banners and 22 category records; both B2C/B2B APIs return Hindi. |
| CMS localized authoring | **Implemented (`ea16cf2`)** | Non-default locale banner/category drafts and publishes use a CMS-internal Knex path; Banner Studio no longer mutates the en-IN draft when saving hi-IN. |
| Placement coverage matrix | **Implemented (`1782cce`)** | Seven placements listed with live/scheduled/draft state; category coverage counts categories; missing/duplicate slots are visible to operators. |
| Full-page admin preview | **Implemented (`1782cce`)** | Welcome/home/category page context at App / Mobile web / Desktop, with the current draft banner and published page shell. |
| B2B trade-offer rail | **Implemented (`6e106f6`)** | Three trade cards with MOQ, tier price and add-to-quote on `/trade`. |
| Desktop category rail | **Implemented (`3ffbefd`, icon fit 19 Nov)** | CMS categories render in a horizontal rail with inline icons on B2C shopping pages; 12 links (Discover + All products + 10 categories) fit at 1440px (`scrollWidth = clientWidth = 1360`); hidden on trade, auth, checkout and account pages and below 900px. |
| Product tile delivery/stock note | **Implemented (`63c9812`)** | Authored `metadata.delivery_note` renders on B2C and trade tiles; real `stock_badge`/`inventory_quantity` renders “Only X left”/“Out of stock”. Action Tesa staging note verified. |
| B2B quick order + buy again | **Implemented (`a3e5f6e`)** | `/trade/quick-order` with SKU/title search, saved-list chips, MOQ quantity steppers and Add to quote; buy-again lines from owner-scoped orders on `/trade` and quick order. |
| Product Studio delivery note | **Implemented (`93eeac1`)** | `delivery_note` added to the studio save contract and metadata; Product Studio field loads the authored note; storefront tiles render it. |
| Media-library crop editor | **Implemented (`93eeac1`)** | Banner Studio shows 3×3 focal grid over the desktop and mobile creative with live `object-position` previews; selection updates the focal-point field. |
| Host cutover | **Implemented** | `gobazarbee.com` (and `www` redirect) serves the Next.js B2C/B2B store; `app-staging.pinakaplay.cloud` serves the Flutter Web build from `buildkart-flutter`; `api-staging`/`ops-staging` unchanged. |
| App-parity web merchandising | **Implemented** | `/discover` find-right-aisle hub with guided task search, CMS category banners + inline icons on home/rail/chips, cart “You may also like”, browser-local “Recently viewed” rails, and the signed-in “Ask BazarBee” drawer with human workspace + assistant threads. See `webstore-app-parity-2026-11-19.md`. |
| B2B trade-rate checkout | **Implemented** | `/trade/catalogue` and trade offer tiles expose **Add to cart** at the selected quantity/MOQ; the B2B offer enters the order cart at its tier unit price and the API creates a B2B order for the trade buyer. **Add to quote** remains alongside. |
| Single category lanes | **Implemented** | B2C home “Shop by category” and the B2B home/category selector are one horizontal lane with scroll, not wrapping grids. B2C: 8 cards, 2502/1232; B2B: 10 cards, 3130/1232; B2B catalogue selector: 1497/1232. |
| Policy pages | **Implemented (draft preview)** | `/terms`, `/refunds`, `/shipping`, `/privacy`, `/contact`, `/about` and `/policies` render the mirrored policy pack with a draft notice, withheld GSTIN and `noindex`. Footer links all seven. |
| Branded creative assets | Shipped | B2C/B2B hero and welcome art at desktop/mobile sizes, CMS records published; branded B2C mobile welcome art added with CORS for Flutter web. |

### Implementation log

| Change | Evidence |
|---|---|
| Web consumes CMS presentation and app-shell | B2C home hero/campaign/categories/Flash/Recommended; B2B hero/category |
| CMS/admin responsive creative | `imageMobileUrl`, `imageTabletUrl`, `imageDesktopUrl` fields, admin inputs, delivery mapping |
| Welcome placements | `b2c.welcome.banner` / `b2b.welcome.banner` in registries, CMS records and web sign-in |
| Branded assets | B2C hero/campaign, B2B hero and welcome art at desktop/mobile sizes |
| CMS writes | B2C hero “Build more. Buy better.” / monsoon campaign; B2B “Your trade desk, on the web.”; welcome banners |
| Surface CTA mapping | `ctaAppRoute` / `ctaWebPath` on the CMS banner, admin fields and validation, delivery projection and web resolution; hero CTA renders `/search` with campaign UTM |
| Focal point + category picker | `imageFocalPoint` CMS/admin field (nine positions), delivery `image_focal_point`, web `object-position`; category destination uses a searchable datalist with 10 commerce categories |
| Product + collection pickers | Product destination loads 100 admin products; collection destination loads 5 collections; invalid product ids are rejected with the `prod_` prefix rule |
| Full-page preview + coverage | Admin Banner Studio (`93eeac1`): 7 placement rows, welcome/home/category page context, App/Mobile/Desktop frames, web override and CTA fields; focal-point preview applied |
| B2B trade offers | `/trade` rail with 3 products, MOQ/tier price and add-to-quote; quote line total `₹19,450` |
| Desktop category rail | 11 CMS links (All products + 10 categories) at 1440px; last link visible, rail `scrollWidth = clientWidth = 1360`; Electrical opens `/search?cat=lighting-electrical` with 2 products; hidden on `/trade`, checkout and 390px |
| Test orders | `BK-261119-PKWH70`, `BK-261119-EH54M7`, `BK-261119-D35FDW`, `BK-261119-QFEJWX`, `BK-261119-2ZVH8R`, `BK-261119-4S660H`, `BK-261119-ARC9HJ`, `BK-261119-BSCDR4`, `BK-261119-KCQJ60` (B2C, ₹3,889.50), `BK-261119-PTPF1G` (B2B, ₹18,576.50), `BK-261119-PECZY3` (B2C 2-line, ₹639.50), `BK-261119-0W0KCD` (B2B MOQ 5, ₹18,576.50); all simulated |
| hi-IN QC | B2C/B2B APIs return Hindi banners and all 10 category labels; web home/category pages render Hindi; switch back to en-IN works; hi-IN checkout `BK-261119-4S660H`; 390px no overflow |
| Delivery note + quick order | Action Tesa tile shows “Standard delivery · 1–3 business days”; `/trade/quick-order` shows 4 trade lines, SKU filter returns 1 line, Add to quote wrote `₹350` to the quotation cart; buy-again section renders 1 previous line |
| Product Studio + crop editor | Action Tesa Product Studio shows the saved delivery note; Banner Studio crop editor shows desktop/mobile previews, 9 focal cells, and selecting top-left updates the focal field |
| Flutter welcome renderer | `bd956e2`: welcome banner model/providers + onboarding/login widgets; `flutter analyze` clean; build served at `app-staging`; B2C/B2B welcome images load (HTTP 200) |
| Flutter release blocker | Firebase CLI has no authenticated session/token on this machine; the host cutover bypasses Firebase by serving the built Flutter Web app from `buildkart-flutter` at `app-staging.pinakaplay.cloud`. |
| CMS localization path | `ea16cf2`: non-default locale drafts/publishes use the query-engine/Knex path so Banner Studio edits do not touch the en-IN draft; verified on a banner and a category; 24 hi-IN banners visible in the admin list |
| Host cutover | `gobazarbee.com` root/www → Next.js; `app-staging.pinakaplay.cloud` → Flutter static container; `PUBLIC_APP_HOSTNAME=gobazarbee.com`; `www` 308 → root; post-swap B2C order `BK-261119-BSCDR4` `₹3,889.50` |
| App-parity web merchandising | `/discover` guided hub; 8 category tiles with CMS banner imagery + inline icons; 12-link icon rail with fit 1360/1360; cart cross-sell 4 items; recently viewed rail; B2C drawer tabs Assistant/Project chat (19 messages) and B2B Assistant/Procurement (33 messages), both assistant channels replied |
| B2B trade checkout | **Add to cart** at MOQ/tier price and **Add to quote** on every trade tile; quote 5 × ₹3,890 = ₹19,450, offer −₹972.50, delivery ₹99, total ₹18,576.50; order `BK-261119-PTPF1G`; cart metadata `channel=b2b` |
| Product tiles + drag-scroll | B2C tiles add to cart (0→1); B2B tiles add at MOQ (0→5) and quote; no visible scrollbars; mouse drag scrolls category lanes/filter bars, click-after-drag suppressed; see `product-tiles-drag-scroll-2026-11-19.md` |
| B2B price-unit correction | Six `BuildKart B2B Studio` rows stored 100× low; corrected ×100; first invalid order `BK-261119-MAM41J` ₹283.77 retired; corrected order above; see `b2b-price-unit-correction-2026-11-19.md` |
| Category lanes | B2C home lane 2502/1232 with 8 cards; B2B home lane 3130/1232 with all 10 categories and active-term counts; B2B catalogue selector nowrap 1497/1232; mobile 390 no overflow |
| Policy pages | `/terms`, `/refunds`, `/shipping`, `/privacy`, `/contact`, `/about`, `/policies`; 6 cards on index; 7 footer links; draft notice, GSTIN withheld, no placeholders, `noindex`; see `policy-pages-2026-11-19.md` |
| Full B2C/B2B order QC | **Completed (web pass; backend gaps)** | B2C `BK-261119-PECZY3` 2 lines ₹639.50; B2B `BK-261119-0W0KCD` MOQ 5 ₹18,576.50; notifications/shipments/outbox pass; payment capture and Tryton reservation remain open. See `full-store-qc-2026-11-19.md`. |
| Releases | Web `release-web-20261119-170224` (source `da87849`; header delivery selector, static app preview); previous `release-web-20261119-162411` (home hero rotation); `release-web-20261119-160503` (source `bae1bc0`); CMS `ea16cf2`; API `5639fe3`; admin panel `93eeac1`; Flutter build `bd956e2` served at `app-staging`; branch `feat/bazarbee-branding` |
| Final visual QC | Nemotron 3.5 Super VL reviewed B2C home/campaign/category, B2B hero/category and 390px views: **ship, no P0/P1** |
| Final functional QC | B2C at `gobazarbee.com`: rail 11 links, Electrical 2 products, Tools 4 products, checkout `BK-261119-BSCDR4` at `₹3,889.50`; B2B: hero, 4 offer cards, Tools banner + 1 product; Flutter at `app-staging` onboarding/welcome renders; 390px no overflow |
| Locale + rollback QC | hi-IN presentation returns 4 B2C / 2 B2B Hindi banners and 10 Hindi categories; campaign hero unpublish `200` removed it from delivery (4→3) and republish `200` restored it (3→4); `ROLLBACK_OK` |
| Admin QC | Ops staging: 7 coverage tiles, category counts, full-page preview, web overrides, app-route/web-path fields, focal-point select (value `Bottom`), category datalist (10 options), product datalist (100 options), collection datalist (5 options), invalid product id rejected; no page errors |

---

## 1. Channel and publication model

| Concept | Values |
|---|---|
| Channel | `b2c`, `b2b` |
| Locale | `en-IN`, `hi-IN` |
| CMS content kinds | `storefront-layout`, `banner`, `curated-collection`, `category-editorial`, `product-editorial`, `faq-article` |
| Publication | Draft → Published → Modified; scheduled start/end in IST; optimistic concurrency on edits |
| Delivery | Admin console → Medusa admin content API → CMS operator content → Experience API projection → Flutter app / Next.js web |

The **published** record is authoritative. The web store must never hardcode banner copy, category
labels, section order or product badges that the CMS owns.

### 1.1 Channel switching and B2C default

The web store mirrors the Flutter app’s channel model:

| Rule | Behaviour |
|---|---|
| Default | Anonymous and B2C-only users land on `/` (Shop, B2C). |
| B2B route | `/trade`, `/trade/catalogue`, `/trade/credit`, `/trade/quote` are the B2B workspace. |
| Route is the channel | No `?channel=` flag; the path determines the active channel, so refresh/deep links preserve it. |
| Entitlement | `b2b_buyer` from `/v1/me/contexts` enables the Trade channel. |
| Switch UI | Signed-in trade users see a **Shop / Trade** switch in the desktop header. |
| Mobile switch | Trade pages expose “Switch to consumer”; account shows “Switch to BazarBee Trade” when entitled. |
| B2C-only user | No Trade switch; `/trade` remains the marketing/apply entry, and `/trade/catalogue` shows “trade account required”. |
| Carts | B2C cart (`bazarbee.cart.v1`) and B2B quotation cart (`bazarbee.trade.quote.v1`) are separate; switching never moves lines between them. |
| Content | Each channel consumes its own banners/layouts/categories; B2C seed content never appears in B2B. |
| Session | One login/session; the role projection decides whether the switch is shown. |

Acceptance:

1. Anonymous `/` renders B2C; `/trade` renders the trade marketing/workspace entry.
2. A signed-in `b2b_buyer` sees Shop/Trade; switching goes to `/` or `/trade` without a 404.
3. A B2C-only user never sees the switch and cannot open the trade catalogue.
4. Switching does not mix the retail cart with the quotation cart.
5. The active channel remains correct after refresh and on mobile.
6. `Switch to consumer` on the trade nav and the account channel row work.

---

## 2. B2C surfaces

### 2.1 B2C welcome / onboarding

Current welcome screen:

| Element | Current behaviour |
|---|---|
| Brand mark | 72px BazarBee app icon |
| Headline | “Everything you need, delivered to your site.” |
| Subcopy | “Shop for your home or business — from everyday essentials to bulk building supplies.” |
| Benefits | Delivery to your doorstep · Better prices for every buyer · Business buying made easy |
| Primary CTA | Full-width “Get Started” → login |
| Banner | **None today** |
| Guest path | None; catalogue is gated behind login |
| Legal | No terms/privacy links |

**Proposed welcome banners (new placements):**

| Placement | Channel | Behaviour |
|---|---|---|
| `b2c.welcome.banner` | B2C | Optional single banner above the headline; if absent, the current icon/headline layout remains |
| `b2b.welcome.banner` | B2B | Optional trade-specific banner on the B2B welcome/login mode; if absent, current B2B copy remains |

Properties to manage: internal name, content key, channel, locale, title, subtitle, image, alt text,
CTA label, CTA target, schedule, priority, segments, publish status. A welcome banner must not replace
the value-proposition benefits; it is additive.

> These two placements do **not** exist in the current placement registry. Adding them requires updating
> the admin `SUPPORTED_PLACEMENTS`, the Experience API `placement-registry`, and
> `tooling/validate_banner_types.py`, then teaching the welcome screens to consume them.

### 2.2 B2C home (`/`)

| Feature | Detail |
|---|---|
| Pinned bar | Logo, search (“products or ask what you need”), conversation bell, notification bell, B2B switch, cart badge |
| Hero | Delivery location, trust chips (GST invoices, verified sellers, easy returns), CMS hero carousel, CTA |
| Discovery | “Find the right aisle”, category/brand counts, AI project chips, Explore all |
| Default modules | Flash Deals carousel, Best Sellers carousel, optional campaign strip, Recommended for You composition + Recently viewed slot |
| Layout-driven modules | Banner, carousel, grid or composition; operator controls order, visibility, title, badge, limit, See All |
| Catalogue unit | Category banner, category icon rail, product grid, auto-loading pages |
| Product tile | Image, badge stack, wishlist, brand, title (one line), price, discount pill, MRP, add/stepper |

Merchandising properties:

| Property | Admin source |
|---|---|
| Hero banners | Banner Studio → `b2c.home.hero` |
| Campaign strip | Banner Studio → `b2c.home.campaign-strip` |
| Home sections | Storefront layouts (B2C): Flash Deals, Best Sellers, Recommended |
| Section title/badge/subtitle | Storefront layout section fields |
| Product source | Commerce collection referenced by the section |
| Products to show | Section `limit` |
| See All | Section `seeAllLabel`, `seeAllUri` |
| Section banner | `bannerReference` on sections that accept a banner |
| Schedule/visibility | Section `startsAt`, `endsAt`, `enabled` |
| Category labels/icons/banners | Editorial → Category presentation + Banner Studio category placement |
| Product title/image/brand/price/badges | Product Studio + offer/B2B pricing data |

### 2.3 B2C category / browse (`/browse`, `/collections/:key`)

| Feature | Detail |
|---|---|
| App bar | Browse, conversation bell, notification bell, cart badge |
| Search | Products, brands or SKU (variant labels and SKUs included) |
| Category banner | Category title, “Top picks in this aisle”, CTA Best sellers |
| Category rail | All + categories, single-select |
| Sort | Relevance, Price ↑, Price ↓, Rating |
| Quick filters | Flash Deal, Clearance, In stock |
| Full filters | Brands, price ranges, key items, 4.0+ rating, active count, clear |
| Results | Count, two-column grid, load more, all-shown state |
| No results | Suggested filters + popular products |
| Collections | Collection title, responsive grid, pull-to-refresh, explicit empty/not-found |

Merchandising properties: `b2c.category.banner` (copy + image + alt), category editorial
(label, short text, icon key, hero image, alt), collection membership, product badges/prices.

**Precedence for category copy:** banner title → category editorial label → governed seed → commerce
name; same chain for subtitle. Banner image → editorial hero image → seed. Icon comes from the category
editorial or seed.

---

## 3. B2B surfaces

### 3.1 B2B welcome / login

Current B2B mode on the login screen:

| Element | Current behaviour |
|---|---|
| Mode switch | Consumer D2C / B2B Trade segmented control |
| Title | “B2B Trade Portal Sign-In” |
| Copy | “Enter your phone to access wholesale pricing & credit.” |
| Field | “Pilot email or 10-digit phone” |
| CTA | Get OTP |
| Trust line | “No lengthy forms or extra details collected during login.” |
| Banner | **None today** |

Proposed `b2b.welcome.banner` adds optional trade creative (credit, GST invoicing, MOQ, project supply)
without changing the identity step. The B2B welcome should be a separate content variant from B2C.

### 3.2 B2B home (`/b2b`)

| Feature | Detail |
|---|---|
| Header | BazarBee Trade, search, delivery site, conversations, notifications, cart, account |
| Hero | B2B-only `b2b.home.hero` banners; no B2C fallback |
| Quick order | Saved procurement-list chips, SKU grid, MOQ quantity steppers, Add to Order, See All |
| Buy Again | Previous order lines, reorder, See All |
| Trade Offers & Deals | Featured offer collections, active collection, trade product rail, See All |
| Categories + Products | Category banner, trade category rail, product grid, See All |
| Cart summary | Visible when the cart is non-empty |
| Bottom nav | Trade, Browse, Credit, Cart, Account |

Merchandising properties:

| Property | Admin source |
|---|---|
| Trade hero | Banner Studio → `b2b.home.hero` |
| Trade Offers & Deals | Storefront layouts (B2B): `trade_offers` group with `seasonal`, `best_deals`, `schemes` |
| Buy Again | Layout section `buy_again` (customer history source) |
| Quick order lists | Curated collections (`Collections & trade lists`) and saved procurement lists |
| Category banner | Banner Studio → `b2b.category.banner` |
| Category labels/icons | Editorial → Category presentation |
| Trade product price/MOQ/tiers | Product Studio → B2B pricing |
| Section title/badge/limit/See All | Storefront layout fields |

### 3.3 B2B category (`/b2b/catalogue`)

| Feature | Detail |
|---|---|
| App bar | Dynamic title (Catalogue / Best Deals / Seasonal / category) + conversation bell |
| Search | Products and SKU |
| Banner | Category title, “Trade rates · MOQ · GST invoicing”, CTA Filters/Best Deals |
| Category chips | All + trade categories |
| Sort | Recommended, Price ↑, Price ↓, Discount |
| Quick filters | Best Deals, Seasonal |
| Filter sheet | Trade filters, active count, clear |
| Results | Count, responsive 2/3/4-column grid, load more, all-shown |
| Trade tile | Image, badge, title, MOQ, savings, tier selector, unit price/pc, list price, stock, add |
| No results | Suggested searches + nearby products |

Merchandising properties: `b2b.category.banner`, category editorial, product B2B price/MOQ/tiers,
trade category membership, savings %, seasonal flag, stock, badge.

---

## 4. Product tile specification

### B2C (`CartProductCard` → `ProductCard`)

| Property | Rule |
|---|---|
| Image | `BoxFit.contain` on tinted surface; placeholder on failure |
| Badges | Top-left, max 2 + `+N`; allowlist; colour by label |
| Wishlist | 44×44 translucent heart, top-right |
| Add / quantity | 44×44 cart-plus bottom-right; compact stepper once exact variant is in cart |
| Brand | 11px secondary, one line |
| Title | 13px compact / 14px large, **one line** |
| Price | 18px compact / 20px large |
| Discount | Promotion pill beside price |
| MRP | 11px struck-through, only when a real MRP exists |
| States | Loading, failure, out-of-stock (tap/add disabled) |

Review notes: one-line titles hide SKU identity; desktop rails show 8 cards across at 1440px; the add
button overlays the product image; out-of-stock has no visible label; rating/review/delivery props are
accepted but not rendered. See the separate review doc for the full list.

### B2B (`tradeProductTile`)

| Property | Rule |
|---|---|
| Image | Product image with badge |
| MOQ | “MOQ N” label |
| Savings | “N% off” when a real list price exists |
| Tiers | Quantity band → unit price selector |
| Price | Unit price/pc for selected quantity |
| Stock | Known stock state, add disabled when unavailable |
| Add | Adds the selected quantity to the quotation/order cart |

Admin inputs: B2B price, MOQ, tiers, list price, stock, badge, title, image, category.

---

## 5. Admin console UX

### 5.1 Navigation map

| Menu | Page | Purpose |
|---|---|---|
| Merchandising | Banners | Banner Studio: create/publish banners by placement, channel, locale, schedule |
| Merchandising | Storefront layouts | Section composition for B2C/B2B home |
| Merchandising | Bought together | Pair products for “Bought together” |
| Merchandising presets | Presets | Campaign/collection/promotion presets |
| Editorial | Category presentation | Category label, short text, icon, hero image/alt |
| Editorial | Collections & trade lists | Curated collections for B2C/B2B, offers, quick-order lists |
| Editorial | Product editorial | Product storytelling content |
| Product Studio | Details, media, organisation, specs, tags, variants/offers, inventory, review | Product and offer authoring |

### 5.2 Banner Studio

Current UX:

- Tabs: **Live, Draft, Scheduled, Historical**, placement filter, locale.
- Editor sections: **01 Details & placement** (internal name, placement, category if required, language),
  **02 Creative & copy** (HTTPS creative, alt text, heading, supporting text, CTA label),
  **03 Destination** (route/product/category/collection/url reference), **04 Schedule** (start now/later,
  end, IST), advanced technical key/priority/segments.
- Preview devices: **App, Mobile web, Desktop**.
- Lifecycle: draft/publish/unpublish/duplicate; eligibility = eligible/scheduled/expired.
- Hero rotation: per-channel `heroRotationMs` saved through the storefront layout.
- Optimistic concurrency: 409 on a newer draft.
- Category banners: pick a category; copy overrides category editorial copy.

Gaps for the webstore:

| Gap | Impact | Recommendation |
|---|---|---|
| No welcome placements | Cannot manage welcome banners | Add `b2c.welcome.banner` / `b2b.welcome.banner` to the registry, admin, delivery and validation |
| Creative is a raw HTTPS URL; upload/crop/focal point deferred | Cannot art-direct desktop/mobile crops | Add media library + desktop/tablet/mobile crops or one focal-point crop |
| CTA destinations are raw reference IDs | Broken links, wrong product/collection | Add searchable product/category/collection pickers and URL validation |
| Category copy editable in two places | Banner and category editorial can disagree | Show precedence explicitly; badge which source wins |
| Preview is banner-only | Layout composition is not seen as a page | Add full B2C/B2B home and category previews before publish |
| Segments are raw JSON | Easy to publish an invalid audience | Provide segment templates/validation |
| No welcome/login preview | Welcome banner cannot be reviewed in context | Add welcome and login preview devices |
| Publish is per locale | EN/HI can drift | Add a locale completeness/publish checklist |

### 5.3 Storefront layouts

Current UX:

- Channel-scoped (`b2c` / `b2b`) + locale.
- Sections: add, delete, reorder; display title, badge, subtitle, product source, collection, product
  limit, See All label/URI, banner reference, start/end, enabled.
- B2C types: `flash_deals`, `best_sellers`, `recommended` (collection source).
- B2B types: `buy_again` (customer history), `trade_offers` group (`seasonal`, `best_deals`,
  `schemes`), plus top-level seasonal/best-deals/schemes.
- Validation mirrors delivery: duplicate placements, wrong channel, missing collection, missing group
  children, invalid schedule; warnings for banners on sections that do not accept them.
- Draft/publish; optimistic concurrency.

Gaps: no welcome section type (welcome banner is standalone, not a layout section); no full-page
preview; no per-section product picker/override; no side-by-side locale view.

### 5.4 Category presentation and collections

- Category editorial: category id, label, short text, icon key, hero image, alt, channel/locale.
- Collections & trade lists: collection key, audience (`b2c`/`b2b`/`both`), placement, title,
  description, category labels, product ids, limit, default quantity, display order, icon key, accent,
  deal type, scheme label.
- Category banner override precedence is documented above.

### 5.5 Product Studio

Fields relevant to tiles and merchandising:

- Title, subtitle, description, category, tags, media, variants.
- B2C price/offer readiness.
- B2B price, MOQ, quantity tiers, list price, channel readiness.
- Inventory and review/visibility.
- Badge labels come from product tags/review enrichment, filtered through the B2C badge allowlist.

Gap: no explicit **storefront tile** section for a display-title override, tile badge override, image
focal point, or short tile description. Add one if operators need card-level control beyond tags.

---

## 6. Property → admin → webstore mapping

| Customer property | Admin control | Webstore component |
|---|---|---|
| B2C hero banner | Banners → `b2c.home.hero` | `app/page.tsx` hero carousel |
| B2C campaign strip | Banners → `b2c.home.campaign-strip` | Home campaign band |
| B2C category banner | Banners → `b2c.category.banner` + Category presentation | Category banner on `/search?cat=` |
| B2C home sections | Storefront layouts (B2C) | Home section renderer |
| B2C product tile | Product Studio + offers | `components/product-card.tsx` |
| B2B hero | Banners → `b2b.home.hero` | `/trade` workspace hero |
| B2B category banner | Banners → `b2b.category.banner` | `/trade/catalogue` banner |
| B2B trade offers | Layout `trade_offers` + curated collections | `/trade` offers rail (next phase) |
| B2B quick order | Curated collections / saved lists | `/trade/quick-order` (next phase) |
| B2B price/MOQ/tiers | Product Studio B2B pricing | `/trade/catalogue` tile |
| Welcome banner | **Proposed** `b2c.welcome.banner` / `b2b.welcome.banner` | Welcome/onboarding and B2B login |

Experience API endpoints the web should use:

- `GET /v1/content/presentation?locale=…&channel=b2c|b2b` → banners + categories.
- `GET /v1/content/app-shell?locale=…&channel=…` → layout sections (resolved products, empty collections,
  `source`, `freshness`).
- `GET /v1/content/curated-collections?locale=…&channel=…` → B2B trade lists/offers.
- `GET /v1/collections/{key}` → collection page.
- `GET /v1/products?channel=b2b` → trade catalogue.

---

## 7. Webstore update plan

### 7.0 Delivery phases

#### Phase 1 - Presentation and category banners

- Add typed server clients for presentation and app-shell.
- Replace the static home hero with `b2c.home.hero` banners (priority, schedule, CTA).
- Add `b2c.home.campaign-strip`.
- Replace hardcoded category tiles in `lib/catalogue.ts` with `presentation.categories` (label, icon,
  image, alt, count).
- Use `b2c.category.banner` on category pages; fall back to category editorial then seed.

#### Phase 2 - Layout-driven B2C home

- Render sections in published order with title/badge/limit/See All/banner.
- Support `flash_deals`, `best_sellers`, `recommended` (and `productComposition`).
- Show empty-collection explanations and never silently substitute unrelated products.
- Keep a governed fallback only when the CMS layout is absent; never use B2C seed content on B2B.

#### Phase 3 - B2B layout and trade surfaces

- Render `b2b.home.hero` on `/trade`.
- Add `buy_again` (needs web order-history data), `trade_offers` group with seasonal/best-deals/schemes,
  and the trade category rail.
- Map trade product tiles to B2B price, MOQ, tiers and stock.
- Add trade offer collections and quick-order lists where the data exists.

#### Phase 4 - Welcome, login and tile parity

- Add optional welcome banners for B2C and B2B.
- Add full-page preview in admin for welcome/login/home/category.
- Add media crops, CTA pickers and segment templates.
- Align tile fields: two-line titles, visible stock, rating/delivery where authored, badge overrides.

### 7.1 Acceptance criteria

1. A published banner appears only on its channel/placement/locale and within its schedule.
2. Priority order is respected; expired/scheduled banners are not shown.
3. B2C seed/fallback content never appears on a B2B surface.
4. The default `/` is B2C; signed-in trade users can switch Shop ↔ Trade; B2C-only users cannot enter the trade catalogue.
4. Storefront layout order, visibility, title, badge, limit and See All match the admin record.
5. Category banner copy/image follows the documented precedence and falls back safely.
6. Product tiles render the authored title, image, price, MRP, discount, badge, stock and B2B
   MOQ/tiers; no raw HTML or unsafe CTA.
7. Welcome banners are additive; without one, the current welcome layout still renders.
8. Admin preview matches the published web/mobile result before publish.

### 7.2 Dependencies and risks

- Welcome placements require mirror updates in admin, Experience API and the validator; otherwise they
  publish but never render.
- Responsive art direction needs media crops; the current editor only accepts an HTTPS URL.
- Raw CTA reference IDs can create broken links until pickers exist.
- Category copy has two editing surfaces; precedence must be visible to operators.
- Web needs a cache/freshness policy; use the API `source` and `freshness` fields and avoid stale
  fallbacks.
- B2B quick-order and buy-again require web data that the current web slice does not yet have.
- Staging remains `noindex` and test-data only; production needs the CHG-020 gates.

### 7.3 Delivery work breakdown

#### Delivery status — 19 Nov 2026

| Item | Status | Evidence |
|---|---|---|
| MERCH-01 Responsive creative | Done | Desktop/tablet/mobile URL fields, image focal point, visual crop editor, admin inputs, delivery projection, `<picture>` sources and `object-position`; branded assets published. File-level media-library crops remain a future editor upgrade. |
| MERCH-02 Surface-aware CTA | Done | `ctaAppRoute` + `ctaWebPath` fields, publish validation, web resolution; category/product/collection references are searchable and prefix-validated. |
| MERCH-03 Welcome placements | Done | Registry, CMS records, API delivery and admin placement list |
| MERCH-04 Welcome renderers | Done (web + Flutter build) | B2C/B2B welcome banners on web sign-in, Flutter onboarding and login; Flutter web release awaiting Firebase authentication. |
| MERCH-05 Web copy overrides | Done | `webTitle` / `webSubtitle` / `webCtaLabel` in CMS, admin, delivery and web |
| MERCH-06 Full-page preview | Done | Welcome/home/category context at App/Mobile/Desktop in Banner Studio |
| MERCH-07 Placement coverage | Done | Seven-slot matrix; category counts; missing and multiple-campaign states visible |
| MERCH-08 Category copy precedence | Existing | Banner → category editorial → governed seed, with source shown in preview |
| MERCH-09 Web CMS consumption | Done | B2C/B2B banners, categories and layout sections read from `/v1/content/presentation` and `/v1/content/app-shell` |
| MERCH-10 Layout sections | Done | Published order, title/badge/limit/See All, Flash Deals and Recommended rails; empty sections are filtered |
| MERCH-11 Attribution | Done | Internal banner links append `utm_source=web&utm_medium=banner&utm_campaign=<content key>` |
| MERCH-12 QA matrix | Verified (en-IN + hi-IN) | B2C/B2B at 390/1440 in both locales; en-IN/hi-IN presentation, locale switch, category rails and hi-IN checkout verified; publish/unpublish rollback passed. |
| MERCH-13 Channel switch | Done | B2C default, role-gated Shop/Trade, route-scoped channels and separate carts |

| ID | Owner | Change | Depends on | Done when |
|---|---|---|---|---|
| **MERCH-01** | Admin + API | Responsive creative: `imageDesktop`, `imageTablet`, `imageMobile`, `imageAlt`, focal point or media-library crops. Keep one-image fallback. | CMS banner definition | Editor saves all variants; delivery serves them; preview shows the correct crop. |
| **MERCH-02** | Admin + API | Surface-aware CTA: canonical product/category/collection target, plus `appRoute` + `webPath` for custom routes; validation for both. | MERCH-01 | Publish is blocked when the web destination is missing/invalid; web never receives an app-only route. |
| **MERCH-03** | Admin + API + App/Web | Add `b2c.welcome.banner` and `b2b.welcome.banner` to the placement registry, CMS delivery, validator and previews. | CMS + delivery registry | Admin lists them as rendered; API delivers them; app/web consume them. |
| **MERCH-04** | App + Web | Render optional welcome banners; retain the current icon/headline/benefit layout when absent. | MERCH-03 | No banner → current layout; B2C banner never appears on B2B and vice versa. |
| **MERCH-05** | Admin + API + Web | Optional `webTitle`, `webSubtitle`, `webCtaLabel` overrides and a shared character budget. | MERCH-02 | App copy fits; web overrides are optional; tested widths do not truncate. |
| **MERCH-06** | Admin | Full-page preview for welcome, home and category on App / Mobile web / Desktop. | MERCH-01, 02, 04 | Preview matches the published page before publish. |
| **MERCH-07** | Admin | Placement coverage matrix; one record per placement; warn when a required slot has no banner. | MERCH-03 | Operator can see missing home/welcome/category slots; channel-wide substitution is rejected. |
| **MERCH-08** | Admin + API | Show category copy precedence (banner → editorial → seed) and return the winning source. | MERCH-01 | Operator sees which source wins; no duplicate-copy confusion. |
| **MERCH-09** | Web | Consume `/v1/content/presentation` and `/v1/content/app-shell`; pick image by viewport; resolve CTA; map placements to web components; revalidate. | MERCH-01, 02 | B2C/B2B banners and categories come from CMS; no hardcoded hero/category copy. |
| **MERCH-10** | Web | Render layout sections in published order with title/badge/limit/See All/banner and empty-collection states. | MERCH-09 | Published order/visibility/limits match; empty collections explain themselves. |
| **MERCH-11** | Web + Ops | Per-surface attribution: UTM or click event distinguishing app vs web. | MERCH-02 | Dashboard can separate app and web clicks for the same campaign. |
| **MERCH-12** | QA | Channel/locale/schedule/expiry/CTA/responsive matrix; publish/rollback rehearsal. | All | Evidence recorded for B2C/B2B, 390/1440, en-IN/hi-IN. |
| **MERCH-13** | Web | B2C-default role-gated Shop/Trade switch; route-based channel, mobile switch, channel-scoped carts/content. | Auth contexts | Trade user switches; B2C-only sees no switch; carts stay isolated; refresh preserves the channel. |

### 7.4 Sequencing

| Phase | Work | Outcome |
|---|---|---|
| **0. Contracts** | MERCH-01, MERCH-03 | CMS/admin/API can represent responsive welcome banners; registry is no longer missing slots. |
| **1. Admin control** | MERCH-02, 06, 07, 08 | Operators can author, validate and preview the web result. |
| **2. Web consumption** | MERCH-09, MERCH-10 | Home/category banners and sections render from CMS; hardcoded fallbacks removed. |
| **3. Welcome + copy** | MERCH-04, 05 | B2C/B2B welcome banners and optional web copy overrides ship. |
| **4. Attribution + QA** | MERCH-11, 12 | Campaign reporting and release evidence. |

**Can ship before Phase 0:** existing placements with one image, canonical product/category/collection
CTAs, copy/schedule/priority/locale, and the current app/web fallback. Use `object-fit: cover` and a safe
text zone on web; do not block the current web launch on media crops.

**Do not ship before Phase 1:** any banner that depends on a custom app-only route, or a welcome banner
without a full-page preview.

---

## 8. Single-banner model — web compatibility assessment

The current admin exposes one banner record per placement, with **one creative URL** (`externalImageUrl`)
and one copy/CTA set. A record is already scoped by channel, placement and locale. If the same record is
intended to serve both the app and the web store, the following applies.

### What works for the web store as-is

| Area | Works? | Notes |
|---|---|---|
| Copy, CTA label, schedule, priority, locale, publish state | Yes | One record can drive both surfaces. |
| B2C vs B2B separation | Yes | Placements carry the channel; B2C seed banners never fall back to B2B. |
| Home hero, campaign strip, category banner | Yes | Web can consume `b2c.home.hero`, `b2c.home.campaign-strip`, `b2c.category.banner`, `b2b.home.hero`, `b2b.category.banner`. |
| Product/category/collection CTA | Yes, if canonical IDs | Both surfaces can resolve the same commerce entity. |
| Draft/schedule/expiry | Yes | Delivery already gates on publication and time window. |
| Preview | Yes | Banner Studio now renders welcome/home/category page context at App / Mobile web / Desktop. |

### What needs action before web parity

| Area | Why it breaks | Action |
|---|---|---|
| **Responsive creative** | One image cannot be right for a phone hero, a tablet, and a 1440px web hero. Admin currently accepts one HTTPS URL; crop/upload is deferred. | Add `imageDesktop`, `imageTablet`, `imageMobile` (or a media-library crop set) with a fallback chain. Web picks by viewport; app keeps using its current crop. |
| **CTA route mismatch** | An app route such as `/browse?tag=Flash%20Deals` or `/b2b/catalogue` is not a valid web path. A single raw route will 404 on web. | Prefer canonical `product` / `category` / `collection` targets. For custom routes, store `appRoute` and `webPath` separately (or a route resolver) and validate both. |
| **Copy length** | App hero copy is short; web has more room. One heading may truncate in the app or look sparse on web. | Add optional `webTitle` / `webSubtitle` overrides, or enforce a cross-surface character budget. Do not duplicate the whole record. |
| **Placement coverage** | One banner per channel is not enough: web needs hero, campaign strip, welcome and category slots. | Manage one record **per placement**. Do not use one channel-wide banner as a substitute for placement records. |
| **Welcome banner** | No welcome placement exists today. | Add `b2c.welcome.banner` / `b2b.welcome.banner` to admin, delivery registry and validator. |
| **Safe area / overlay** | App hero sits under a pinned bar and status area; web sits under a sticky header. Text can collide with chrome. | Preview with the actual chrome (app bar, web header) and keep a safe text zone; or supply separate crops. |
| **Analytics/attribution** | One CTA cannot distinguish app vs web clicks. | Add optional per-surface UTM parameters or a `webPath`/`appRoute` pair with tracking. |
| **Full-page preview** | Admin preview shows the banner in a frame, not the welcome/home/category page. | Add full-page previews for app, mobile web and desktop before publish. |
| **Category copy precedence** | Category copy can be set in Banner Studio and Category presentation. | Surface the precedence in the editor: banner title/subtitle → category editorial → seed. |

### Recommended approach

Keep **one campaign/banner record per placement** and make the record surface-aware rather than creating
separate app and web banners:

```
contentKey, placement, channel, locale
title, subtitle, ctaLabel
imageDesktop, imageTablet, imageMobile, imageAlt
ctaTargetType, ctaTargetId
appRoute?, webPath?          // only for custom routes
startsAt, endsAt, priority, segments
```

Rules:

1. **Canonical commerce targets win.** Product/category/collection IDs resolve on both surfaces; only
   custom editorial routes need `appRoute` + `webPath`.
2. **One copy set by default.** Add web overrides only where the app copy actually cannot fit.
3. **One record per placement.** The channel-wide “single banner” is not enough for home + welcome +
   category; those are different placements with different jobs.
4. **No duplicate app/web records for the same campaign.** Duplicates drift and break scheduling.
5. **Validation must check both surfaces.** A banner cannot publish if its CTA has no valid web path or
   its required image set is missing.

### Web implementation consequence

The web renderer should:

- Select `imageDesktop` / `imageTablet` / `imageMobile` with `object-fit: cover` and a governed focal
  point fallback.
- Resolve CTA by type, never by copying an app route into an `<a href>`.
- Map placements to components: `b2c.home.hero` → home hero, `b2c.home.campaign-strip` → campaign band,
  `b2c.category.banner` → category hero, `b2b.home.hero` → trade hero, `b2b.category.banner` → trade
  catalogue hero, `b2c/b2b.welcome.banner` → welcome screen.
- Use the Experience API `source`/`freshness` fields and a short revalidation window so a publish is
  visible without a full rebuild.

### 8.1 Single-banner workstream

| ID | Task | Maps to | Acceptance |
|---|---|---|---|
| **SB-1** | Add responsive image fields + focal point/crops; keep one-image fallback. | MERCH-01 | 390px, 768px and 1440px each use the intended crop; missing variant falls back cleanly. |
| **SB-2** | Add surface-aware CTA (`appRoute` + `webPath`, or canonical entity + resolver). | MERCH-02 | The same record resolves to a valid app route and web path; no 404. |
| **SB-3** | Add optional web copy overrides/character budget. | MERCH-05 | App and web both fit without truncation at tested widths. |
| **SB-4** | Enforce one record per placement; add placement coverage matrix. | MERCH-07 | Home hero, campaign strip, welcome and category each have their own record or an explicit “not used”. |
| **SB-5** | Add welcome placements and render fallback. | MERCH-03, 04 | Welcome banner appears only on the correct channel; absent banner retains the current welcome layout. |
| **SB-6** | Add full-page preview for app/mobile/desktop. | MERCH-06 | Preview includes the real header/pinned bar safe area; matches publish. |
| **SB-7** | Publish validation: missing web path, missing crop, app-only route, wrong channel. | MERCH-02, 07 | Publish is blocked with a specific error; draft is still saveable. |
| **SB-8** | Web renderer: image selection, CTA resolution, placement map, revalidation. | MERCH-09 | Web renders the same campaign as the app with the correct crop and target. |

**Non-goals for this workstream:** separate app/web banner records for the same campaign; a single
channel-wide banner standing in for multiple placements; hardcoded web fallback copy when the CMS record
is missing (governed seed is allowed only where documented).

**Single-banner definition of done:**

1. A campaign is authored once, scoped to one placement/channel/locale.
2. The app and web each render the correct crop and copy at 390px and 1440px.
3. Both CTAs resolve; an app-only route cannot reach production.
4. Welcome/hero/campaign/category are separate placement records.
5. Admin preview shows the actual page chrome before publish.
6. Unpublishing restores the prior published state; drafts never leak.

## 9. Decisions needed

| Decision | Recommended default | Blocking? |
|---|---|---|
| Welcome banner: single optional hero or carousel? | Single optional banner above the existing value-prop stack; carousel only when multiple campaigns are actually needed. | Blocks MERCH-04 scope only. |
| B2B welcome: separate screen or a B2B variant of the shared welcome? | B2B variant selected before login, using `b2b.welcome.banner`; no separate route unless product asks for it. | Blocks MERCH-04 design. |
| Welcome creative: share with `b2c.home.hero` or separate records? | Separate placements and separate records; welcome and home have different jobs. | Blocks MERCH-03/04. |
| Tile badges: operator override or derived? | Keep derived from tags/reviews for now; add an optional Product Studio tile-badge override in P2. | Blocks only tile polish. |
| Welcome/login approval | Same merchandising publish role plus a second reviewer for welcome/login. | Blocks production publish, not build. |
| Media management | Media library with desktop/tablet/mobile crops; one-image fallback until then. | Blocks MERCH-01 quality, not the web launch. |

If a decision is not made, implement the recommended default and record it in the change contract.

## 10. Release gates

A merchandising change is releasable only when:

1. **Channel isolation:** no B2C banner, seed creative or category copy appears on B2B, and vice versa.
2. **Placement correctness:** the banner is published to the intended placement; a channel-wide “single
   banner” is not used as a substitute for home/welcome/category slots.
3. **Responsive evidence:** 390px and 1440px screenshots show the intended crop, copy and no chrome
   collision.
4. **CTA resolution:** both the app and web destinations resolve; no app-only route remains in a web
   `href`.
5. **Schedule/locale:** scheduled banners are not live early; expired banners are not shown; EN/HI
   records are complete for the launch locale set.
6. **Fallback safety:** missing banner → current welcome/hero fallback; missing layout → governed
   fallback only where documented; no B2C fallback on B2B.
7. **Admin preview:** preview matches the published page, including the real header/pinned-bar safe area.
8. **Rollback:** unpublishing restores the previous published state and leaves drafts untouched.
9. **Channel switch:** anonymous `/` is B2C; only entitled users see Shop/Trade; switching preserves the
   active channel on refresh; retail and quotation carts remain separate.
10. **Evidence:** publish time, actor, placement, locale and screenshots recorded once per bundle.

## 11. HomeRun benchmark

| HomeRun pattern | BazarBee position |
|---|---|
| 60-minute delivery promise and pincode header | Not adopted; BazarBee staging promises 1–3 day delivery. Keep the delivery promise in the tile only when the API carries a real note. |
| Category collections in the header and a category-first home | Adopted through the CMS desktop category rail and category tiles/chips. |
| “Deals of the week” product rail with discount-led cards | Adopted as CMS Flash Deals + campaign strip. |
| Product tiles show delivery promise, free-delivery threshold, bulk-price unlock, option count and add | Partially adopted: option count is live; B2B tiers cover bulk pricing; delivery/bulk messaging needs product metadata before display. |
| Add action visible on the card | Adopted; BazarBee keeps it below the price rather than covering the image. |
| Trade offers and bulk tiers on the B2B home | Adopted as a three-card trade-offer rail with MOQ, tier price and add-to-quote. |
| App-store and wallet/cashback prompts | Not in scope for the storefront pilot. |

**Benchmark outcome:** the category-first home, desktop category rail, deals rail, card-level options,
delivery/stock notes, B2B bulk-tier entry, quick-order and buy-again are adopted. The remaining
spec items (file-level media-library crops and the Flutter hosting release) are not HomeRun storefront gaps.
