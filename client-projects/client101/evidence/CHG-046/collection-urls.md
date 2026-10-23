# CHG-046 — customer-facing collection URLs

**Status:** delivery and app released to staging. Phase 3 (console URL display) not done.
**Date:** 2026-10-17 · **Commit:** `ce3d014` · **Release:** `/opt/buildkart-releases/ce3d014`

## What was actually broken

The brief asked for a link every collection owner can give a customer. Three things were missing, and one
was worse than missing:

| | Before |
|---|---|
| App route | **None.** Banners and editorial already pointed at `/collections/<key>`, so those links were dead. |
| Delivery for console collections | Only a hardcoded key registry resolved. A collection created in the console had no customer URL. |
| Unknown keys | `/v1/collections/<anything>` **silently returned new arrivals** with `fallback: true`. A broken link looked like a working page showing the wrong products. |
| Not-found semantics | None. An empty collection and a wrong link were indistinguishable. |

## What changed

**Delivery** (`collections/resolver.ts`, `medusa/store-client.ts`, `index.ts`)

- An unregistered key is resolved as a **commerce collection handle**; the response carries the
  collection's `title` and `collection_id` plus its deliverable products.
- **Registry keys keep precedence**, so a curated key is never shadowed by a commerce handle of the same
  spelling, and a deferred key (e.g. `best_sellers`) keeps its existing fallback behaviour.
- An unknown handle now returns **404 `collection-not-found`**; a real collection with nothing
  deliverable returns **404 `collection-empty`** — different words for different problems. Neither
  returns another collection's products.

**App** (`screens/collection_screen.dart`, `providers/collection_providers.dart`,
`domain/storefront_collection.dart`, `router/app_router.dart`)

- New `/collections/:key` route rendering the collection title and a product grid, using the same
  `ProductCard` and the same composed products as every other surface (no second pricing path).
- Three distinct states on screen: *Collection not found*, *Nothing here yet* (empty), *No products yet*.
- A key with no published title is humanised (`monsoon-site-essentials` → "Monsoon Site Essentials")
  rather than shown raw. No name is invented server-side.

## Verification

| Check | Result |
|---|---|
| `test:collection-url` (new, 5 assertions) | pass — handle resolves, unknown is not-found, empty is a distinct not-found, registry precedence, deferred fallback preserved |
| Experience API typecheck | clean |
| Flutter analyze | clean |
| Flutter tests | **151 pass** (4 new: not found, empty, no products, humanised title) |
| `GET /v1/collections/flash-deals` | `200`, `title="Flash Deals"`, `collection_id=pcol_01M5…`, 1 item, `fallback=false` |
| `GET /v1/collections/seasonal-offers` | `404 collection-empty` — the collection exists but its single product is not deliverable (honest, per D-046-04) |
| `GET /v1/collections/new_arrivals` | `200`, 12 items, `fallback=false` — unchanged |
| `GET /v1/collections/best_sellers` | `200`, 12 items, `fallback=true` — deferred behaviour preserved |
| `GET /v1/collections/no-such-collection-xyz` | `404 collection-not-found` |
| Deployed app bundle | `/collections/:key`, "Collection not found", "Nothing here yet", "No products yet" all present |
| `https://buildkart-staging.web.app/collections/flash-deals` | `200` (SPA rewrite; the app decides the state) |

## Phase 3 — the link is now visible (released)

A read-only widget on the native collection detail page (`collections.detail.main.after`) shows the
customer URL with a **Copy link** button. It does not add an editing surface to the native collections
page — it only surfaces the address.

The storefront host is deployment configuration (`VITE_STOREFRONT_BASE_URL`), defaulting to
`https://buildkart-staging.web.app` so the link is usable on staging without extra wiring. A collection
whose stored record has no handle renders nothing rather than a guessed URL.

Verified in the **deployed** console bundle (`index-CNwP3AWk.js`): the zone id, "Customer link",
"Copy link" and the explanatory line are all present, and `/dashboard/` returns `200`.

## Limitations

- **No browser has opened a collection page.** The evidence is the API payload, the tests and the presence
  of the route and states in the deployed bundle — not a rendered screen.
- **`seasonal-offers` is empty on staging.** I seeded a product into it earlier, but the store API does
  not return it, so it is either unpublished or not in the default sales channel. That is the correct
  answer from delivery; if a populated example is wanted, that product's channel/publication needs fixing.
- **Registry keys render prices as "price on request"** when the page falls back to raw store items,
  because a raw product carries no composed best-price offer. Console collections (the actual requirement)
  use the composed list and show real prices.
- **Phase 3 is not done:** the console does not yet show or copy a collection's customer URL, so an
  operator has to know to type the handle. That is the remaining convenience step.
- **Ordering is untouched:** with no manual order (CHG-045), delivery keeps its current order.
