# Web store ↔ Flutter app parity — 19 Nov 2026

This change closes the customer-facing gaps found when the Flutter app was compared with
`gobazarbee.com`. It is staging evidence only; production remains unauthorised.

Deployed: `release-web-20261119-142517` from source `058c97a`; live at `https://gobazarbee.com`.

## 1. Feature parity matrix

| Flutter app capability | Web store before | Web store now |
|---|---|---|
| Category banner imagery on home/discovery cards | Only category pages had a banner | Home category tiles, Discover category cards and category/search pages render the published CMS banner with a focal crop |
| Category icons | Emoji/glyph placeholders on home tiles; text-only desktop rail | One inline SVG icon set used on home tiles, the desktop rail, Discover cards and search filter chips; label-first matching tolerates stale CMS `icon_key` values |
| “Find the right aisle” discovery | Text search only | `/discover` hub: guided task cards, category cards with imagery, seller/brand index, popular deals and a search entry point; linked from the home discovery band and the desktop rail |
| Guided search / “AI mode” | `?q=` only | `?mode=guided&q=<task>` maps a household task to the closest **stocked** aisle and states the match explicitly; it does not pretend to be a generative answer |
| Workspace chat / assistant | None | “Ask BazarBee” drawer on every page, signed-in only. It uses the same Experience API workspace proxy and assistant channel as the app: household project for B2C, trade workspace for `/trade` |
| Related products on cart | None | “You may also like” on `/cart`, drawn first from the cart's aisles and then from current deals |
| Recently viewed merchandising | None | Product views are recorded in the browser; a “Recently viewed” rail appears on home and product detail without inventing items |
| B2B order entry | Trade catalogue could only add to a quotation/RFQ | “Buy at trade rate” adds the B2B offer at its MOQ to the order cart and opens checkout; a trade buyer's cart is created as a B2B order by the API |

## 2. Benchmark: L&T-SuFin (high level)

Reviewed `https://lntsufin.com/` on 19 Nov 2026. Patterns worth borrowing:

| L&T-SuFin pattern | Web store decision |
|---|---|
| **AI Mode** beside search | Adopted as guided task search. The staging catalogue has no generative service, so the UI names the matched aisle instead of inventing an answer. |
| Category mega-navigation with 50+ categories | Adopted in proportion: the existing CMS rail stays, now icon-led, plus a dedicated Discover hub for the smaller 10-category catalogue. |
| Deals grouped as New Arrivals / Best Selling / Popular Deals | Adopted as “Today's deals” on Discover and the existing Flash Deals / Best Sellers home sections. |
| Bulk quote / RFQ and trade credit | Already present in the trade workspace; unchanged. |
| Help Center / support entry | Replaced by the signed-in assistant drawer and the existing account/orders surfaces; a phone/email help centre is still a production follow-up. |
| Verified-seller trust cues | Existing seller name, offer count and stock notes retained; no new trust badge was invented. |

Not adopted: 50+ category mega-menu, seller marketplace onboarding, loan/credit application, and
multi-city location picker — they need services or content that do not exist in this staging slice.

## 3. Implementation map

| Surface | Files |
|---|---|
| Category icon set | `apps/web/app/components/category-icon.tsx` |
| Home category imagery, discovery band, recently viewed | `apps/web/app/page.tsx`, `apps/web/app/globals.css` |
| Discover hub | `apps/web/app/discover/page.tsx`, `apps/web/lib/discovery.ts` |
| Guided search | `apps/web/app/search/page.tsx` |
| Chat / assistant | `apps/web/app/components/chat-drawer.tsx`, `apps/web/app/api/chat/route.ts`, workspace functions in `apps/web/lib/experience-api.ts` |
| Recently viewed | `apps/web/lib/recently-viewed.ts`, `apps/web/app/components/record-product-view.tsx`, `apps/web/app/components/recently-viewed-rail.tsx`, `apps/web/app/api/products/route.ts` |
| Cart cross-sell | `apps/web/app/cart/page.tsx`, `apps/web/app/cart/cart-view.tsx` |
| B2B order entry | `apps/web/app/trade/catalogue/page.tsx`, `apps/web/app/trade/buy-now.tsx` |

Search now also matches seller, brand metadata and category names, so the Discover seller index and
ordinary brand searches return the expected catalogue.

## 4. QC evidence

See `docs/implementation/bazarbee-web-storefront-qc.md` for the full record. This section records the
new surfaces specifically.

### 4.1 Local build gate

```text
npm run typecheck  -> clean
npm run build      -> 18 routes, /discover and /api/chat and /api/products present
```

### 4.2 Browser QC (desktop 1440, mobile 390)

- Home: 8 CMS categories with banner media, 8 inline icons, discovery band, no horizontal overflow.
- Desktop rail: 12 links (Discover + All products + 10 categories); `scrollWidth = clientWidth =
  1360` at 1440px after the icon-fit adjustment.
- Discover: 8 category cards, 5 seller brands, 4 guided tasks, no overflow at 1440 or 390.
- Guided “Paint a room”: guided panel names Paints & Finishes, 6 products, category banner renders.
- Brand search “UrbanBuild Supply”: 11 products.
- Product view writes `bazarbee.recently-viewed.v1`; home renders the Recently viewed rail.
- Add to cart → `/cart` shows 4 “You may also like” products.
- Chat: signed-in B2C drawer shows the household project and the assistant replies; signed-in B2B
  drawer shows the trade workspace and the assistant replies.
- Mobile 390: home and Discover report `scrollWidth = innerWidth = 390`; chat launcher is visible
  above the mobile tab bar.

### 4.3 Test orders

| Channel | Account | Order | Total |
|---|---|---|---|
| B2C | `rsoni001@gmail.com` | `BK-261119-KCQJ60` | ₹3,889.50 |
| B2B | `buyer.b2b01@buildkart.test` | `BK-261119-PTPF1G` | ₹18,576.50 |

- B2C cart metadata: `channel=b2c`.
- B2B cart metadata: `channel=b2b`, `business_account_id=business_arjun_traders`.
- B2B checkout: 5 × trade tier at ₹3,890 (₹19,450), automatic offer −₹972.50, delivery ₹99,
  total ₹18,576.50.
- A first B2B attempt (`BK-261119-MAM41J`, ₹283.77) exposed a 100× price-unit defect in six
  `BuildKart B2B Studio` price-list rows. The staging rows were corrected and the order was
  re-placed; see `b2b-price-unit-correction-2026-11-19.md`.

### 4.4 ChatGPT-based review

`https://chatgpt.com/` returns a Cloudflare “Just a moment…” challenge to this environment and there
is no OpenAI API key or authenticated browser session available. A ChatGPT-hosted review could not be
completed; the checks above are a scripted visual/functional QC instead. This is recorded as a
limitation rather than presented as a completed ChatGPT review.
