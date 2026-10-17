# CHG-044 Phase 3a — Section Product Resolution

**Commit:** `139f9b8`
**Status:** Deployed to staging and verified end to end
**Scope:** The server half of phase 3. The storefront rendering half (3b) is **not** done.

## What this delivers

A layout section stores a **reference** to a commerce collection. This adds the resolution that turns
that reference into products at read time, so the storefront payload can carry real product data
without any product list being copied into editorial configuration.

- `MedusaStoreClient.listProductsByCollection(collectionId, limit)` — the product-resolution counterpart
  to the existing `listProductsByCategory`.
- `resolveSectionProducts(sections, medusa)` — resolves each section, recursively for group children.

### Design decisions

1. **Lean product references, not a commerce payload.** Each product resolves to identity, handle and
   thumbnail. Price, stock and seller data stay where the storefront already gets them, so this does not
   create a second place where commerce is composed.
2. **A failing collection cannot fail the shell.** Resolution is wrapped per section, and the section
   returns an explanation instead of an empty rail with no reason. The whole app-shell call is also
   guarded, so a commerce outage degrades the layout rather than the home screen.
3. **Sources that are not collections say so.** `buy_again` reports that it resolves per authenticated
   customer, `schemes` that it resolves through the offer and scheme services, and `best-selling` that
   ranking is not available yet — rather than silently returning nothing.
4. **The declared limit is honoured** and defaults to 12; a nonsensical limit falls back rather than
   asking commerce for nothing.
5. **Empty collections are reported** in `layout.empty_collections`, so an operator can tell "no products
   in the collection" from "the section is misconfigured".

## Verified end to end on staging

| Step | Result |
|---|---|
| Before adding products | `empty_collections=["pcol_01M535V0776WS7MDF0BCVFG9F9"]` — resolution ran and reported honestly |
| Add a real product to the collection via `POST /admin/collections/{id}/products` | ok |
| After | each of the three B2C sections returns `products=1`, first title `BuildPro Hand Tool Kit 120-Piece` |

```
flash_deals   | Flash Deals         | badge=Up to 60% OFF | limit=8  | products=1
best_sellers  | Best Sellers        | badge=Most Loved    | limit=10 | products=1
recommended   | Recommended for You | badge=-             | limit=6  | products=1
sections=3  empty_collections=0  modules=5
```

Badges, labels and limits survive; product membership follows the collection with no editorial action;
`modules` is untouched.

## Tests

New `section-products-test.ts` covers: the declared limit reaching commerce, the default limit, an
invalid limit falling back, a failing collection explaining itself without throwing, a section with no
collection, the three non-collection sources being labelled, and group children resolving while the
group carries none. Wired into the Experience API workflow.

`typecheck` clean; `section-products-test`, `layout-sections-test` and `presentation-test` all **PASS**.

## Not done — the visible half

**The storefront still does not read any of this.** The Flutter app has no layout consumption at all: no
`app-shell` call, and `homeModulesProvider` still builds Flash Deals, Best Sellers and Recommended
locally. So section order, titles, badges, limits, See All targets and visibility are configured and
delivered but not rendered. That is phase 3b, and until it lands nothing here is customer-visible.

Also still open: drag-and-drop ordering (currently move up/down), client-side validation on the raw JSON
property page, and Buy Again and Schemes remaining fixtures.

Staging content created for this proof: one Medusa collection (`flash-deals`), one product membership,
and three sections on the B2C layout.
