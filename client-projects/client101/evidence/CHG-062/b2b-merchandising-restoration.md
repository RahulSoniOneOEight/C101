# CHG-062 — B2B quick-order lists and trade deals restored

**Date:** 2026-10-19
**Status:** Implemented and locally verified; staging deployment pending
**Change:** `client-projects/client101/changes/CHG-062.yaml`

## What was missing

B2B Home had three merchandising units wired to pre-import demonstration ids:

| Unit | Fixture | Live outcome |
|---|---|---|
| Quick order | `pl_seasonal` / `pl_kitchen` / `pl_floor` with `prod_led`, `prod_tiles`, … | every list resolved zero products |
| Trade Offers & Deals | `off_seasonal` … `off_festive` with the same demo ids | no featured collection resolved, so the unit hid itself |
| Layout children | Medusa collections with no membership | `empty_collections` in the app-shell response |

The deals unit is deliberately fail-closed: it renders nothing when no
collection resolves a live product. The catalogue import removed those
products, so a merchandising module disappeared rather than showing dead tiles.

## What changed

### Catalogue rules instead of ids

Quick order now ships four rule lists, resolved from the live catalogue by L1
category:

| List | Rule | Cap |
|---|---|---|
| Electrical Essentials | Lighting & Electrical | 20 |
| Bathroom & Plumbing | Bathroom & Plumbing | 20 |
| Paints & Finishes | Paints & Finishes + Tiles & Building Materials | 18 |
| Tools & Hardware | Tools & Hardware | 20 |

Each resolves 15–20 products against the staged catalogue (Lighting 71,
Tools 71, Tiles 37, Bathroom 23, Paints 11).

Trade offer collections use the same rule shape, so the deals rail reappears:

| Collection | Rule | Cap |
|---|---|---|
| Seasonal | Lighting & Electrical | 8 |
| Best Deals | Bathroom & Plumbing | 8 |
| Schemes | Paints & Finishes + Tiles & Building Materials | 8 |
| Bulk Buy | Tools & Hardware | 10 |
| Clearance | Tiles & Building Materials | 8 |
| Festive Offers | Agriculture & Seeds | 6 |

Resolution matches the product's L1 label **or** its commerce category id, so
the same rule works against the live API and the offline fixture.

### Persistence and migration

The persisted list keeps the rule, not twenty product ids, so a later
catalogue change updates every list. `resolvedProcurementListsProvider`
materialises items for the UI; buyer additions are kept ahead of the rule
result. Only an untouched demonstration seed is replaced; a buyer-renamed or
edited list is preserved, and the fourth list is appended to older stores.

### Console properties

`curated-collection` gains the properties these modules need:

`description`, `categoryLabels`, `limit`, `defaultQuantity`, `displayOrder`,
`iconKey`, `accent`, `dealType`, `schemeLabel`

The CMS bootstrap seeds seven B2B records (four `b2b.quick_order`, three
`b2b.trade_offers`) idempotently. They appear in the operator console under
**Collections & trade lists**, with the existing product-id field retained as
an explicit override. `GET /v1/content/curated-collections?channel=b2b`
delivers them to the app.

The app applies console records over the governed rules by display order:
title, supporting text, category rule, cap and default quantity. With no
authored record — or an unreachable CMS — the governed rules apply unchanged.

## Verification

| Check | Result |
|---|---|
| Four rule lists resolve 20 / 20 / 18 / 20 | pass |
| Every resolved SKU exists in the catalogue | pass |
| Deals unit visible (`tradeOffersHaveProductsProvider`) | pass |
| Explicit product ids override the category rule | pass |
| Console record retitles and retargets a list | pass |
| Untouched demo seed replaced, buyer edit preserved | pass |
| `flutter analyze` | pass |
| `flutter test --exclude-tags golden` | 214 pass |
| `bun run typecheck` (Experience API) | pass |
| OpenAPI parses, 38 paths | pass |

Tests: `test/b2b_merchandising_restoration_test.dart`, plus the updated quick
order, procurement list, trade-offer and overflow suites.

## Deployment

Released `3b2026a` to staging:

- CMS rebuilt and restarted; the additive `curated-collection` schema synced
  and the bootstrap seeded seven B2B records (`cms-seed` logged success).
- Experience API rebuilt, container recreated, proxy restarted.
- App rebuilt and published to Firebase Hosting (`STAGING · 3b2026a`).

Live checks:

| Check | Result |
|---|---|
| `GET /v1/content/curated-collections?channel=b2b` | 7 records, source `cms-strapi` |
| Quick-order caps vs live availability | 20/71, 20/23, 18/48, 20/71 |
| Deals caps vs live availability | 8/71, 8/23, 8/48 |
| B2B home render | four quick-order chips; Trade Offers & Deals visible with live lanes |
| Buy Again | empty-state copy (no order history for a new buyer) |

The console exposes the new fields under **Collections & trade lists**. The
admin dashboard label change ships with the next backend admin build; the
fields themselves are served by the CMS definition, so operators see them now.

## Staging fixture

Category rules are a staging merchandising fixture. They do not create
collection membership in Commerce, do not change prices or discounts, and do
not claim a production assortment.

Staging only; production release remains unauthorized.
