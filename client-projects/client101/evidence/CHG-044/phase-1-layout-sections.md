# CHG-044 Phase 1 — Layout Section Model and Delivery

**Date:** 17 October 2026
**Commit:** `cc5b2f6`
**Status:** Deployed to staging; awaiting human review

## What phase 1 delivers

A storefront layout was an unvalidated JSON `modules` blob. It is now an ordered, typed section list
with a channel-scoped placement registry, validated on delivery. This is the model the editor
(phase 2) and the storefront (phase 3) both build on.

### Placement registry

`services/experience-api/src/content/layout-sections.ts` is the authority:

| Channel | Placement | Source | Banner |
|---|---|---|---|
| B2C | `flash_deals` — Flash Deals | collection | yes |
| B2C | `best_sellers` — Best Sellers | collection | no |
| B2C | `recommended` — Recommended | collection | no |
| B2B | `buy_again` — Buy Again | customer history | no |
| B2B | `trade_offers` — Trade Offers & Deals | group | no |
| B2B | `seasonal` — Seasonal | collection | yes |
| B2B | `best_deals` — Best Deals | collection | yes |
| B2B | `schemes` — Schemes | schemes | no |

### Normalisation on delivery

`normaliseLayoutSections(input, channel, now)` returns the sections that may actually be served plus an
**issues** list. Rejected entries are dropped so the storefront never renders a broken section, and
every rejection carries a reason so the console can explain it instead of failing silently. It enforces:

- **order is the stored order** — the merchandising decision, never re-sorted;
- **channel isolation** — a B2C placement cannot serve B2B and vice versa;
- **a source is required** — a collection section with no collection is not servable;
- **unknown placements are rejected**, not rendered;
- **visibility and window** — `enabled: false` or an out-of-window section is not visible;
- **banner rules** — a banner association is kept only where the placement accepts one, and reported
  when offered where it does not;
- **group children** — `trade_offers` reports any missing child and restores the declared child order,
  because the storefront renders them as tabs.

## Storage and contract

- `storefront_layouts.sections` (json) added; `modules` is no longer required, so a sections-only layout
  is valid. Modules remain as the raw recovery format during the transition.
- `GET /v1/content/app-shell` now always returns `layout.sections` as an array — empty until an operator
  configures sections for that channel — alongside the existing modules.

## Verification

- New test `services/experience-api/src/scripts/layout-sections-test.ts` covers the registry, stored
  order, channel isolation, missing sources, unknown placements, visibility, schedule, banner rules and
  group children. Wired into the Experience API workflow.
- `layout-sections-test` **PASS**; `presentation-test` **PASS**; Experience API `typecheck` clean; CMS
  build clean; `validate_cms_schemas.py` passes.
- Deployed `cc5b2f6`; live check: `app-shell?channel=b2c` returns `layout=b2c-home`, `source=cms-strapi`,
  `sections` is an array (length 0), `modules` length 4.
- `storefront_layouts.sections` column confirmed present.

## Decision uncovered — collection identity

The brief's "collection" is a **Products → Collections** (Medusa) collection: it has a handle, a product
count and a publication state. But the existing layout modules reference a **CMS `curated-collection`**
(`membership.mode: "curated-collection"`, `collection_key: "power-tool-week"`). These are two different
entities with similar names.

A section's collection reference must be settled before phase 2, because the editor has to offer a
picker, show a product count, and link to the right editor:

- **Option A** — reference a Medusa collection (id and handle). Matches the brief; needs a collection
  picker and count from the commerce API.
- **Option B** — keep referencing the CMS curated-collection. Matches existing layouts; but then "product
  count" and "publication status" mean something different from the brief.

I have not chosen between them; the phase-1 field is deliberately named neutrally and nothing is
authored against it yet.

## Not done in phase 1

- The **section editor** (phase 2). Sections are currently authorable only through the advanced JSON
  field; the routine editor does not exist yet.
- **Storefront consumption** (phase 3). The app still decides section order and content locally.
- **Collection-scoped manual ordering** (phase 4).
- **Real Buy Again and Schemes** (phase 5) — both remain fixtures, and are labelled as such.
- **The Merchandising navigation reduction** (phase 6).
- The registry is not yet mirrored in the console, so no divergence check exists for it yet. The mirror
  arrives with the editor in phase 2, when there is a consumer for it.
