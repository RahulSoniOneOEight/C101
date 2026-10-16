# CHG-044 Phase 6 — navigation, and closing the raw-JSON gap

**Status:** released to staging. Merchandising now holds exactly the two composition editors.
**Date:** 2026-10-17 · **Commit:** `2e14acd` · **Release:** `/opt/buildkart-releases/2e14acd`

## The navigation

Phase 6 could not be done the obvious way. `RouteConfig` in the dashboard SDK has **no `hidden` flag**,
so an item can only be removed from the sidebar by removing its route. Meeting "Merchandising must
contain exactly Banners and Storefront layouts" therefore required deciding where the displaced editors
live rather than muting them.

| Before | After |
|---|---|
| Merchandising: Overview, Banners, Storefront layouts, Category presentation, Product editorial, Collection presentation, Help and articles, Review queue, Delivery status, Content activity (10) | **Merchandising**: Banners, Storefront layouts (2) |
| — | **Editorial** (new, rank 56): Category presentation, Product editorial, Collection presentation, Help and articles |

- The four editors **moved** (`git mv`, URLs now `/editorial/*`) rather than being deleted, so no
  capability was lost. `content-model.ts`'s four `route` values and `CATEGORY_DETAILS_ROUTE` in the
  banner studio were updated to match, which is the whole cross-link surface (verified by grepping every
  route string before and after).
- Overview, Review queue, Delivery status and Content activity were **retired** as the CHG-044 decision
  specified. `/merchandising` now redirects to Banners instead of Overview.
- `ContentOperationsTable` lost its last caller and was removed with them; `PageTabs` survives because
  the property pages still use it.

## Raw-JSON validation

The section editor validated before saving, but the advanced `/content/storefront-layout/<id>` JSON view
did not: an operator could store sections that delivery silently drops, with nothing explaining why the
storefront ignored them. That path now runs `validateStoredSections` for the storefront-layout kind and
refuses the save with the delivery-side reasons.

## Verification

| Check | Result |
|---|---|
| Admin console `tsc -b` | exit 0 |
| Admin console `vite build` | built in 40.5s |
| Registry / contract / schema validators | 8 placements aligned; 4 banner types aligned; 6 content types, 9 components, 16 references; 37 experience paths |
| `/dashboard/` on staging | `200` |
| Medusa health `/health` | `200`; `/admin/collections` unauthenticated → `401` (RBAC intact) |
| Deployed bundle, `/editorial/*` paths | present (4 of 4) |
| Deployed bundle, retired `/merchandising/*` paths | **0 of 4 present** |
| Deployed bundle, `nested:"/editorial"` | present (the Editorial group root) |
| Deployed bundle, raw-JSON guard string | present |

The bundle check is the load-bearing one: the deployed artifact contains the new group and none of the
retired routes.

## Limitations

- **No browser has rendered the sidebar.** The evidence is the built and deployed artifact, not a
  screenshot; that the group renders with two children in this order is inferred from the route configs
  and the bundle, not observed.
- **Route URLs changed for four editors.** Anything holding an old `/merchandising/category-presentation`
  style bookmark now 404s. No in-repo reference was left behind, but I cannot see external bookmarks or
  a tester's saved links.
- **The console has no automated behavioural tests.** Validation of the new guard rests on typecheck,
  build and the presence of its message in the bundle — not a test that exercises a rejected save.
- **Deployments are not unified.** `medusa-api` runs from `/opt/buildkart-releases/2e14acd`;
  `experience-api` still runs from `/opt/buildkart-releases/0ce1a4f` (its own code is identical between
  the two). `current` points at `2e14acd`, so a future `docker compose up -d` from it converges both.
  I chose not to force an extra restart cycle for label-only tidiness.

## Carried forward

Recorded as follow-ups rather than done, with the reason each is not a small edit:

1. **Collection-scoped manual ordering (D-044-03, phase 4).** Needs new persistence — a Medusa module and
   migration for a per-collection rank, an admin API, and a surface in the collections admin. That is a
   material architecture change and belongs in a Change Contract of its own.
2. **Buy Again from real order history (D-044-08, phase 5).** Customer-scoped order history with reorder
   revalidation — commerce work, still a labelled fixture.
3. **Campaign strip as an orderable placement.** It is presentation, not a section, so it renders after
   the layout sections. Making it a placement needs a new source kind (banner-only) across the registry,
   delivery and app — and the strip has no collection to resolve, so it is not a mechanical registry add.
4. **A discount claim in the governed fallback seed.** The fixture campaign-strip copy reads
   *"Clearance Sale — Up to 70% off select items"* and renders when no banner is authored. That is an
   unevidenced discount claim sitting in the storefront's default state, which the programme's own rules
   forbid. It predates CHG-044 (the seed, `presentation.dart`, `review_catalogue.dart` and two tests all
   carry it). Fixing it means changing the fixture copy, the tag mapping in `d2c_shell.dart` and those
   tests; I stopped short of a rushed edit to a visible surface at the end of this pass and am flagging it
   instead.
5. **Drag-and-drop section ordering.** Move up/down remains; no drag-and-drop library is a dependency.
6. **The CMS bootstrap seed** still needs a fresh database to prove.
