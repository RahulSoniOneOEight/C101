# Two reported defects: console banners not reaching the app, sparse swimlanes

**Status:** both fixed and released. Two of the three causes were mine; one is a reporting defect in the
publish path.
**Date:** 2026-10-17 · **Commit:** app `f8a8b2d` (pending) · staging data corrected live

## Defect 1 — banner edits in the console never appeared in the app

**Cause: a placement mismatch, and it was total.** Delivery publishes a banner's *type*, which carries
the channel (`b2c.home.hero`). The storefront asked for a *surface* (`home.hero`) and compared with `==`.
No CMS banner ever matched, so the app silently fell back to its local seed for every home banner — the
console had been editing records the storefront never looked at.

```
delivered                        app asked for         match
b2c.home.hero                    home.hero             never
b2c.home.campaign-strip          home.campaign-strip   never
```

**Fix:** the channel segment is dropped once, at parse (`surfacePlacement`), so both the new type values
and legacy unprefixed values resolve to the same surface. Call sites are unchanged.

**Verified:** two new tests — a CMS-shaped payload parses to `home.hero` and `bannersFor('home.hero')`
finds it; legacy unprefixed placements still match. `flutter analyze` clean, **153 tests pass**, app
rebuilt and redeployed.

## Defect 2 — the campaign-strip banner was never published

**Cause: a publish that reported success and did nothing.** `secondary-clearance-sale` had only a draft
row (`published_at` null) while the three heroes were published at 07:22. My publish call for it had
returned `200` at the same time as the others.

**Fix:** re-published; `published_at` is now set and delivery serves it.

**Still open:** the publish response returns the *draft* document with `publishedAt: null` even when the
publish succeeds (`{"document": {..., "publishedAt": null}}`). That is why the first failure looked like a
success. The response should report the published state, or the operation should be verified server-side
before answering 200.

## Defect 3 — swimlanes showed one product

**Cause: the collections really were empty, and my earlier membership write used the wrong body.**

The catalogue has 52 products; `flash-deals` had 1, and both collections I created had **0**. My earlier
evidence claimed each collection was "seeded with one product" — that was wrong. I called
`POST /admin/collections/:id/products` with `{product_ids: [...]}`; the endpoint expects `{add: [...]}`,
so it returned `200` and added nothing. The earlier claim in `phase-3c-b2b-consumption.md` should be read
as superseded by this file.

**Fix:** memberships written with the correct body, and the three B2C sections now point at three
different collections instead of all three at `flash-deals`:

| Collection | Products | Used by |
|---|---|---|
| `flash-deals` | 12 | Flash Deals (limit 8) |
| `seasonal-offers` | 8 | Best Sellers (limit 10) |
| `trade-best-deals` | 8 | Recommended (limit 6) |

Rails still stop at their section `limit` — that is the display property, editable in the section editor.
The 12/8/8 counts are what the collection can serve; the rail shows `limit` of them.

**Verified:** admin count and storefront resolution agree for all three (12/8/8), and delivery returns
three sections with distinct collections.

## What this changes about earlier evidence

- `phase-3b-storefront-consumption.md` and `phase-3c-b2b-consumption.md` describe section *order and
  labels* reaching the app, which was true for layout sections. They do **not** establish that banners
  reached the app; they did not.
- The claim that the staging collections were seeded with products was false. Nothing depended on it
  except the B2B trade-offer proof, which used local fixtures rather than these collections.

## Limitations

- **Still no browser confirmation.** The banner fix is proven by unit tests over the delivered payload
  shape, not by seeing a hero change on screen. That is the check I most need from you.
- **All three rails are now distinct collections but share one product pool** (products were assigned in
  contiguous slices of the catalogue), so some products appear in more than one rail. That is expected of
  collections, not a duplication bug.
- **The publish response defect is recorded, not fixed** — fixing it means changing the operator content
  contract's response shape.
