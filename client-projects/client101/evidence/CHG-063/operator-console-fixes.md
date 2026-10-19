# CHG-063 — operator console correctness and UX fixes

**Date:** 2026-10-20
**Status:** Implemented and locally verified; staging deployment pending
**Change:** `client-projects/client101/changes/CHG-063.yaml`

Fixes the P1 and P2 findings from
`docs/implementation/admin-console-review-2026-10-20.md`.

## P1

### Collection customer link

`widgets/collection-customer-link.tsx` now builds
`<storefront>/#/collections/<handle>`. The storefront is hash-routed, so the
previous path-only URL loaded the shell but never the collection.

### One time model for every editor

New `content/time-input.ts` owns the IST conversion. The banner studio
re-exports it, the layout editor and the generic content editor now use it.
Schedule fields therefore mean the same wall-clock instant in all three
editors.

Round-trip check: `2026-10-20T10:00` (IST) → `2026-10-20T04:30:00.000Z` →
`2026-10-20T10:00`.

### Settlement truth

The three hardcoded rate cards (10% / 8% / 12% with retired category names) are
gone. The summary is derived from the loaded statements:

- statement count;
- effective commission = commission ÷ merchandise after refunds;
- total payable;
- rates actually applied, from each statement line.

A separate row lists **enabled commission rates from the policy API**
(`client.admin.commissionRates`), with defaults marked. If the policy cannot be
read, the page says so instead of showing a number.

### Layout publishing safety

- Publishing asks for confirmation.
- Navigating away with unsaved changes prompts, and closing the tab warns.
- "Save and publish" is disabled when nothing changed and the layout is already
  published.
- Validation still blocks publishing.

### Naming

Sidebar label is now **Collections & trade lists**, matching the page heading
and content type. The stale banner-model comment claiming B2B has no placements
was corrected.

## P2

### Settlement tables

Both settlement tables are wrapped in a horizontal scroll container, so money
columns are reachable on narrow screens. Statuses are humanised (`Reviewed`,
`Held`, `Pending`).

### Search

The content library writes `q` to the URL once, 300 ms after typing stops,
instead of once per keystroke. The timer is cleared on unmount.

### Timing labels

"Starts/Ends" now use a render-time clock refreshed every minute rather than a
module-load constant.

### Rule preview

The curated-collection editor shows **Resolved products**: it fetches the same
governed catalogue payload the app reads, applies explicit ids or the category
rule and cap, and reports the count, the first six products, missing ids and an
empty-rule warning. `productIds` is now an editable structured field, so an
explicit override is possible rather than invisible.

Configured with `VITE_EXPERIENCE_API_BASE_URL`; defaults to
`https://api-staging.pinakaplay.cloud`.

### Bundle and lint

- React, router and query are split into vendor chunks. Entry dropped from
  6,900 kB to 6,622 kB (1,660 → 1,571 kB gzip). The remaining weight is the
  dashboard SDK host shell; the warning stays and is documented.
- Lint passes. The collection widget's config export is marked, matching the
  other file-based route pages.

## Verification

| Check | Result |
|---|---|
| IST round-trip | pass |
| `npm run build` | pass |
| `npm run lint` | pass (0 problems) |
| Collection URL contains `/#/collections/` | source verified |
| Settlement cards contain no literal rates | source verified |
| Rule preview resolves from the catalogue | source verified; live check after deploy |

No test runner exists in the admin app, so verification is build + lint + the
time-helper check + post-deploy bundle inspection.

## Not changed

The P0 edge protection (Cloudflare Access and security headers) is
infrastructure, not application code. It stays open and tracked in the review.

Staging only; production release remains unauthorized.
