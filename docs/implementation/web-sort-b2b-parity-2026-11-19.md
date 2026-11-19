# Sort/filter placement + B2B tile and flow parity — 19 Nov 2026

Status: **shipped to staging web** · Release `release-web-20261119-180704` · Source `f281680`
Hosts: `https://gobazarbee.com/search` · `/trade` · `/trade/catalogue` · `/trade/pdp/[id]`
Branch: `feat/bazarbee-branding`

Lane: **B** — web UI and query-string composition against the existing B2B catalogue projection.
No schema, service or database changes.

## 1. Filters next to sort

On `/search` and `/trade/catalogue` the **Filters** trigger and the sort pills now sit in the same
heading action row. Active-filter chips still wrap underneath. The previous separate filter row below
the category chips is gone from `/search`.

At 1440 px the filter and sort controls share the same row (`y=291` measured on `/search`, `y=299` on
`/trade/catalogue`). At mobile widths the controls stack and the sort pills wrap instead of
overflowing.

## 2. Fastest delivery sort

Both catalogues now offer **Fastest delivery**:

- Ranks in-stock products by their delivery promise.
- Uses the product's authored `delivery_note` / `delivery_estimate` when present (for example
  `1–3 business days`).
- Otherwise uses the standard **3–5 day** staging promise already shown on the Flutter PDP.
- Out-of-stock products rank last.
- Ties fall back to the strongest discount.
- When selected, the catalogue explains the promise under the result count.

This is deliberately **not** a fake distance calculation. The catalogue projection does not expose a
seller location or a per-seller ETA. The only logistics API today is
`checkServiceability(postcode)`, which returns `eta_days: 3` for every valid postcode. A true
distance sort needs the Experience API to expose seller location / ETA per offer.

Live check: `sort=fastest` puts *Action Tesa HDHMR Board* first because it carries a `1–3 business
days` note; the rest fall back to the standard promise.

The Flutter app's own listing sorts are Recommended/Price/Discount (B2B) and
Relevance/Price/Rating (B2C); it does **not** currently have a distance sort. The web control is
therefore a new, data-backed addition rather than a copy of an existing Flutter sort.

## 3. B2B tile parity — what was missing

The Flutter B2B tile (`tradeProductTile` → `TradeProductCardCompact`) carries:

- image with savings / stock badges;
- brand/seller, MOQ, title;
- selectable quantity-tier chips;
- tier-adjusted unit price, MRP and savings;
- a plus action at zero and a quantity stepper once the line is in the RFQ;
- navigation to the B2B PDP.

The web trade catalogue had a static tier table; the B2B home, quick order and quote rail used
B2C-style cards without tier chips or in-quote steppers. There was also no B2B product page — trade
tiles linked to the consumer PDP, losing MOQ and tier pricing on click.

### Shipped

- One shared `TradeProductCard` with the Flutter tile's elements: seller, MOQ, stock, delivery,
  selectable tier chips, tier price, MRP/savings, add-to-quote and in-quote stepper.
- Used on:
  - `/trade` — trade offers and buy-again tiles;
  - `/trade/catalogue` — the full grid;
  - `/trade/quick-order` — compact line cards;
  - `/trade/quote` — related trade rail.
- New `/trade/pdp/[id]` with large image, seller/SKU, stock, delivery, **Trade pricing** panel
  (tier selector, MOQ, tier price, add/stepper), specs and related trade tiles.
- The B2B detail offer is normalized from `commercial.selected_seller` (the detail endpoint does not
  return a top-level `best_price`).

### B2B sort and filters

`/trade/catalogue` now has:

- Sort: Recommended, Fastest delivery, Price ↑, Price ↓, Discount.
- Filters: Brand, Price, Discount, Availability (In stock / Flash Deal), reusing the shared filter
  drawer with `basePath="/trade/catalogue"`.
- Category chips preserved alongside filters.
- URL state remains shareable, e.g. `/trade/catalogue?brand=baum&sort=fastest`.

## 4. Verification

| Check | Result |
|---|---|
| B2C filter and sort same row | Pass — both at `y=291` at 1440 px |
| B2C brand filter | Pass — `?brand=jaquar` → 8 products |
| B2C fastest sort | Pass — Action Tesa first; explanation note visible |
| B2B shared tile count | Pass — 3 tiles, 5 tier chips across the catalogue |
| B2B tier selection | Pass — socket set ₹3,890 → ₹3,790 at the 10+ tier |
| B2B add to quote | Pass — button becomes a quantity stepper |
| B2B brand filter | Pass — `?brand=baum` → 1 product |
| B2B filter/sort row | Pass — same row at `y=299` at 1440 px |
| B2B PDP | Pass — trade panel present, 2 tiers, add → stepper |
| B2B home / quick order | Pass — 3 shared tiles each, tier chips present |
| B2B quote related rail | Pass — 2 related tiles, tier chips present |
| Mobile layout | Pass — 0 px page overflow; sort wraps; filter drawer 390×760 bottom sheet |
| `npm run typecheck` / `npm run build` | Pass |

## 5. Remaining gaps (honest list)

- **True distance / per-seller ETA**: not available in the product projection. Fastest delivery
  currently uses the product delivery note + standard 3–5 day promise. Exposing seller location /
  ETA per offer is the next API-level step.
- **Seasonal / Best Deals / merchandising badges**: the Flutter filter sheet has these; the web
  catalogue data does not expose reliable flags. Not added rather than faked.
- **Multi-seller / variant comparison on the B2B PDP**: the web PDP shows the selected best trade
  offer and its tiers. Comparing other sellers/variants remains an app-side flow.
- **RFQ delivery**: still a local draft; no seller message, order, reservation or payment is created
  (unchanged).

## 6. Rollback

Revert the web commit and redeploy. The previous web release is
`release-web-20261119-174302` (cart related merchandising, before the sort/B2B parity pass).
