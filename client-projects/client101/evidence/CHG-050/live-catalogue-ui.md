# CHG-050 — live catalogue UI wiring

## Outcome

The imported catalogue is now live in both web experiences:

- **B2C** `https://buildkart-staging.web.app/#/browse` — **233 cards**, footer
  "All 233 products shown".
- **B2B** `https://buildkart-staging.web.app/#/b2b/catalogue` — **233 cards**,
  same footer, category filters resolving from the live commerce categories.
- One card per grouped product; every SKU is a variant with its own label, SKU
  code, price, seller and offer.
- Search matches title, brand, variant label and **variant SKU** on both surfaces.

Staging only. Production release remains unauthorized.

## What changed

### Experience API (`services/experience-api`) — deployed

- `GET /v1/products` accepts `catalogue_import`, selecting the governed staged
  catalogue by its product metadata marker (`CHG-049`) rather than by
  "everything published". The imported subset is scanned once and paginated in
  memory because the Medusa store API has no portable metadata equality filter.
- The response reports `count`, `limit`, `offset` and the effective `channel`.
- `channel=b2b` is honoured only for an authenticated business buyer; a consumer
  token cannot widen its catalogue view with a query parameter.
- Medusa reads pass the matching sales-channel id; the offer cache key includes
  the channel.
- Products return `metadata`, `categories` and per-variant `best_price` /
  `offer_count` / `in_stock`; detail returns the same plus all offers.
- Product and variant field lists now include `metadata`, `categories.*` and
  `variants.metadata`.

### Flutter app — deployed

- `getAllComposedProducts` pages until the reported count, stops on an
  empty/short page or a page with no new id, and de-duplicates ids.
- `productsProvider` loads the full catalogue; the cache is only an offline
  fallback.
- `Product` carries variants, category identity and the import marker;
  `ProductVariant` carries price, MRP, offer, seller, stock and SKU.
- `tradeCatalogueLiveProvider` maps composed products to trade products: MOQ 1,
  no invented tiers, seller and stock from the winning offer, L1 category id
  resolved from CMS presentation.
- B2B catalogue, home, PDP, quick order, procurement lists and offers read live
  data, with the fixture only as an unreachable-API fallback.
- Cards show the grouped SKU count; the PDP lists every variant with its SKU and
  price, and adds the selected SKU (price and offer) to the cart/RFQ.

### Integrity fixes found during acceptance

1. **No fabricated pricing on imported SKUs.** The review-only enrichment used
   to derive a higher "MRP", a discount pill and merchandising tags. Imported
   products now show the source price only, no derived MRP, no "% off", and no
   review tags. The unsourced Flipkart/Amazon comparison block is omitted for
   imported products.
2. **No duplicate seller rows.** A grouped product's seller is now shown per
   variant; the "Sold by" list (which printed the same seller once per SKU) is
   shown only for products without variant detail.
3. **Real specifications only.** The imported PDP shows Brand, Category, SKU and
   Seller. The illustrative Model/Warranty/Delivery rows are limited to the
   demonstration catalogue.
4. **Product images render on web.** `/static/` on the operator host now sends
   `Access-Control-Allow-Origin: *` and
   `Cross-Origin-Resource-Policy: cross-origin`; without them CanvasKit rejected
   the images and every card fell back to a placeholder.
5. **No duplicate struck-through price.** The B2B tile only prints an MRP when a
   real list price exists, instead of repeating the selling price.

## Verification

### API (live, 2026-10-19)

| Check | Result |
|---|---|
| `catalogue_import=CHG-049`, limit 250, offset 0 | 200, `count: 233`, 233 products |
| Variants / unique SKUs in that page | 500 / 500 |
| Every product marked `catalogue_import=CHG-049` | yes |
| `offset=232` | 1 product |
| `offset=233` | 0 products |
| Sample product | `prod_01M59JHKBZ41EJTYW3X6MCXZC6`, `metadata.brand`, `category_l1`, `categories`, 2 variants |
| Sample variant | `BAUM-237S1-SET-HEX`, offer `offer_01M59JHN9EP8RGG9MVGEJ33MSS`, ₹4750, inventory 50, in stock |

### Browser acceptance (headless Chrome, live staging)

| Check | Result |
|---|---|
| B2C `/#/browse` full scroll | "All 233 products shown" |
| B2B `/#/b2b/catalogue` full scroll | "All 233 products shown" |
| B2B filter `Agriculture & Seeds` | 13 products (matches CHG-049) |
| B2B filter `Lighting & Electrical` | 71 products (matches CHG-049) |
| B2B search `BAUM-237S1-SET-BI-HEX` | finds the socket-set card, hides unrelated products |
| B2C card | brand + "2 SKUs", real price, image |
| B2C PDP | "Variants (2)", both SKUs printed on the chips, selected SKU + seller, real specs |
| B2C PDP pricing | no "% off", no derived MRP, no Price comparison |
| B2B PDP | "Variants (2)", both SKUs, seller per SKU, explicit 50-unit fixture note, MOQ 1 |
| B2B tile | single price, no duplicate struck-through price |

### Local checks

| Check | Result |
|---|---|
| `bun run typecheck` | pass |
| `flutter analyze` | pass |
| `flutter test --exclude-tags golden` | 179 tests pass |
| `flutter build web --release` | pass |

New tests cover pagination (count, empty page, short page), per-variant parsing,
SKU/brand search, imported-price integrity, MOQ/tier mapping, selecting the
second SKU into the B2B cart, and SKU search finding the grouped card.

## Release performed

- Experience API image built from commit `15ee4f9` in an isolated worktree
  (`/opt/buildkart-releases/chg-050`) and the container recreated with the
  server's own `docker-compose.hosted.yml` + `docker-compose.fcm.yml`.
- Proxy restarted to re-resolve the new container IP.
- `nginx.conf.template` updated with the `/static/` CORS block and copied to the
  release directory actually mounted by the proxy; previous file kept as
  `.bak-chg050`.
- Firebase Hosting released to `buildkart-staging`.

## Known gaps

- **Trade Offers & Deals** still uses local collection fixtures whose product ids
  predate the import, so its lanes resolve empty against the live catalogue. The
  imported offers carry no discount, so presenting them as "deals" would be
  fabricated. Needs a governed trade-terms/merchandising source.
- **MOQ / quantity tiers / delivery location** have no upstream contract. MOQ is
  1, tiers are empty, and the PDP shows Marketplace Shipping (the import's
  shipping profile).
- **`Pumps & Machines` and `Building & Construction`** are CMS categories with no
  imported products; they correctly show an empty state.
- **Buy Again** resolves from the buyer's own orders and saved lists. The seeded
  demonstration order lines do not match imported SKUs, so it is empty for a new
  buyer rather than showing invented history.
- B2C `Search` only searches after the full catalogue page-load completes.

## Release status

- Staging implementation: complete and deployed.
- Human staging visual review: pending.
- Production authorization: **false**.
