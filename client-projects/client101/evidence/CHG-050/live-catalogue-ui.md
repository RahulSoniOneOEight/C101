# CHG-050 — live catalogue UI wiring

## Outcome

The two web surfaces no longer truncate or replace the imported catalogue:

- **B2C** reads every page of the composed catalogue instead of one fixed page of 100.
- **B2B** reads the same catalogue from the Experience API through the B2B sales
  channel; the local 16-product fixture is now only an offline/development fallback.
- Both surfaces keep **one card per grouped product** and expose every SKU as a
  variant with its own label, SKU code, price and offer.

This is staging work. Production release remains unauthorized.

## What changed

### Experience API (`services/experience-api`)

- `GET /v1/products` accepts `catalogue_import`, selecting the governed staged
  catalogue by its product metadata marker (`CHG-049`) rather than by
  "everything published". The imported subset is scanned once and then
  paginated in memory because the Medusa store API has no portable metadata
  equality filter.
- The response now reports `count`, `limit`, `offset` and the effective
  `channel`, so a client can page until complete.
- `channel=b2b` is honoured **only for an authenticated business buyer**; a
  consumer token cannot widen its catalogue view with a query parameter.
- Medusa reads now pass the matching sales-channel id, and the offer cache key
  includes the channel.
- Products now return `metadata`, `categories` and per-variant
  `best_price` / `offer_count` / `in_stock`; product detail returns the same
  metadata and categories.
- Product/variant fields now include `metadata`, `categories.*` and
  `variants.metadata`, which the previous field list omitted.

### Flutter app (`apps/prototype_app`)

- `ExperienceApi.getAllComposedProducts` pages until the reported count, stops
  on an empty/short page, de-duplicates ids, and also stops when a page adds no
  new id (a backend that ignores `offset`).
- `productsProvider` loads the full catalogue and only falls back to the local
  cache when the API is unavailable.
- `Product` carries `variants`, `categoryId`, `categoryLabel` and
  `catalogueImport`; `ProductVariant` carries its own price, MRP, offer, seller,
  stock and SKU.
- `tradeCatalogueLiveProvider` maps composed products into trade products:
  MOQ 1, no invented quantity tiers, seller and stock taken from the winning
  offer, L1 category id resolved from CMS presentation.
- B2B catalogue, home, PDP, quick order, procurement lists and offers read
  `tradeCatalogueViewProvider` (live first, fixture fallback).
- SKU search: title, brand, variant label and variant SKU on both surfaces.
- Cards show the grouped SKU count; the PDP lists every variant and adds the
  selected SKU (price and offer) to the cart/RFQ.
- When an older API lists variants without stock, the trade UI says
  "Availability on request" rather than claiming "Out of stock".

## Verification

Local, 2026-10-19:

| Check | Result |
|---|---|
| `bun run typecheck` (experience-api) | pass |
| `flutter analyze` | pass, no issues |
| `flutter test --exclude-tags golden` | 178 tests pass |
| `flutter build web --release` with staging dart-defines | pass |
| New pagination tests (3) | pass |
| New grouped-catalogue / B2B tests (4) | pass |

The new tests cover:

- 3 products fetched in 2 pages with `count`, and the `catalogue_import` /
  `channel` query parameters;
- termination on an empty page when no count is reported, and on a short first
  page;
- per-variant price, MRP, offer, seller, stock and SKU parsing;
- SKU/brand/variant search;
- MOQ 1 and no invented tiers when mapping a live product;
- selecting the second SKU on the trade PDP and asserting the quotation line
  carries that SKU and its price;
- catalogue search by variant SKU finding the grouped card and its "2 SKUs"
  chip.

## Deployment status

- **Experience API:** NOT deployed. The staging host (`89.116.20.164`) rejects
  this machine's SSH key for every attempted user, so the running API still
  lacks `catalogue_import`, metadata and per-variant prices.
- **Firebase Hosting:** NOT deployed. Shipping the app before the API would
  render 285 products (the 233 imported plus 52 demonstration products) and
  variant prices would be missing, so the acceptance build is withheld rather
  than presented as complete.

Required release steps once server access is available:

```sh
# On the staging host, from the repository checkout
docker compose -f services/hosted/docker-compose.hosted.yml build experience-api
docker compose -f services/hosted/docker-compose.hosted.yml up -d experience-api

# Locally
cd apps/prototype_app
flutter build web --release \
  --dart-define=BUILDKART_ENVIRONMENT=staging \
  --dart-define=EXPERIENCE_API_BASE_URL=https://api-staging.pinakaplay.cloud \
  --dart-define=MEDUSA_BASE_URL=https://api-staging.pinakaplay.cloud
cd ../..
firebase deploy --only hosting --project buildkart-staging
```

## Acceptance checks to run after deployment

1. `GET /v1/products?limit=250&offset=0&catalogue_import=CHG-049` returns
   `count: 233`, product `metadata.catalogue_import = "CHG-049"`, `categories`,
   and per-variant `best_price`.
2. `offset=232` returns one product; `offset=233` returns none.
3. B2C `/#/browse` shows **233** cards; the grid footer says
   "All 233 products shown" with no category filter.
4. B2B `/#/b2b/catalogue` shows the same 233 cards, each with its SKU count.
5. Searching `BAUM-237S1-SET-BI-HEX` finds the socket-set card; its PDP lists
   both SKUs and each has its own price.
6. Adding the second SKU to the B2B cart produces a line with that SKU and
   price.
7. Staging stock is still reported as the 50-unit fixture, never supplier stock.

## Known gaps

- **Trade Offers & Deals** still uses the local collection fixtures, whose
  product ids predate the import, so its lanes resolve empty against the live
  catalogue. The imported offers carry no discount, so showing them as "deals"
  would be fabricated. This needs a governed trade-terms/merchandising source.
- **MOQ / quantity tiers / delivery location** are not sourced from upstream.
  MOQ is 1 and tiers are empty; the PDP says "Marketplace Shipping" because that
  is the shipping profile used by the import.
- The B2C `Search` screen only becomes useful once the full catalogue page-load
  completes; it has no incremental query yet.
