# Admin console review — features and UI

**Date:** 2026-10-20
**Scope:** `services/backend/apps/admin` (custom BuildKart pages) on top of Mercur Admin 2.3.4,
plus the live operator surface at `https://ops-staging.pinakaplay.cloud/dashboard`.
**Method:** source review of every custom route and shared component; local `npm run build`
(passes) and `npm run lint` (fails); live bundle and header inspection; deployed asset comparison.
**Status:** Review only — no code changed by this review.

## What the console covers

| Area | Route | State |
|---|---|---|
| Merchandising → Banner studio | `/merchandising/banners` | Implemented; create/edit/duplicate/publish, lifecycle tabs, IST scheduling, customer preview |
| Merchandising → Storefront layouts | `/merchandising/storefront-layouts` | Implemented; section order, per-section fields, child groups, validation parity, draft/publish |
| Editorial → Category presentation | `/editorial/category-presentation` | Implemented; B2C/B2B channel split |
| Editorial → Product editorial | `/editorial/product-editorial` | Implemented (delivery marked pending) |
| Editorial → Collection presentation | `/editorial/collection-presentation` | Implemented; now also carries B2B quick-order lists and deal collections |
| Editorial → Help and articles | `/editorial/help-articles` | Implemented (delivery marked pending) |
| Settlement statements | `/settlement-statements` | Implemented, read-only, simulated |
| Collection customer link widget | collections detail | Implemented |
| Legacy redirects | `/content`, `/merchandising-presets` | Present |

Good foundations worth keeping: optimistic concurrency (`expectedUpdatedAt`), an unsaved-changes
blocker and Ctrl/Cmd+S in the generic content editor, layout validation that mirrors delivery,
banner preview with explicit IST handling, simulation badges on finance, dynamic CMS field
definitions, and labelled form controls.

## Findings

### P0 — Operator edge is not protected as designed

The approved topology puts `ops-staging` behind Cloudflare Access (named allow policy) with
privileged routes still enforcing RBAC. The live response is served directly by nginx:

```
server: nginx            cf-ray: null   cf-cache-status: null
strict-transport-security: null   content-security-policy: null
x-frame-options: null    x-content-type-options: null
```

The console HTML is reachable without an edge challenge, and no baseline security headers are set.
Application login still applies, but the second layer documented in
`docs/implementation/cloudflare-access-migration-plan.md` is absent.

### P1 — "Copy link" on a collection produces a dead link

`widgets/collection-customer-link.tsx` builds `${STOREFRONT_BASE}/collections/${handle}`. The
storefront is a hash-routed Flutter app (`/#/collections/<handle>`), so the copied URL loads the
app without the route. Every collection link shared by an operator is broken.

### P1 — Scheduling times shift by 5h30 in two editors

- Banner studio is correct: `toIstInputValue` / `fromIstInputValue` convert to and from
  Asia/Kolkata explicitly.
- Layout editor (`toLocalInput` / `fromLocalInput`) displays UTC in a `datetime-local` input and
  writes it back as UTC, so an operator entering 10:00 schedules 15:30 IST.
- Generic content editor (`toFormValue` uses `toISOString().slice(0,16)`, `parseForm` uses
  `new Date(raw)`) displays UTC but parses as browser-local, moving the instant the other way.

The same operator action means three different things depending on which editor is used.

### P1 — Settlement page hardcodes commission policy

The page renders `10%` global, `8%` Building Materials and `12%` Power Tools as literals. They are
not read from the commission policy the page links to, and the category names ("Power Tools",
"Building Materials") do not match the imported L1 categories. If policy changes, the console
continues to state the old rates — on a finance screen.

### P1 — Layout publishing has no confirmation and no unsaved guard

- "Save and publish" publishes immediately, unlike every other publish path in the console, which
  asks for confirmation.
- Navigating away from an edited layout loses the draft with no prompt (`useBlocker` is used in the
  content editor, not here).
- The publish button is enabled when nothing has changed.

### P1 — Naming and release drift

- The sidebar item is **Collection presentation** while the page heading and content type say
  **Collections & trade lists** (the label change from CHG-062 is in source but not in the deployed
  admin bundle).
- The deployed bundle still serves the old label (`hasNewLabel: false`, `hasOldLabel: true`); the
  admin app ships inside the `medusa-api` image, which was not rebuilt in the last release.
- A stale comment in `banner-model.ts` says B2B has no banner placements, while
  `b2b.home.hero` and `b2b.category.banner` are both supported and rendered.

### P2 — Settlement tables clip on narrow screens

Both settlement pages wrap the table in `Container ... overflow-hidden` with no horizontal scroll
container. On a narrow window the right-hand money columns are cut off rather than scrollable.
Money is right-aligned and `Intl`-formatted, which is correct.

### P2 — Content library search navigates on every keystroke

`content-property-page.tsx` writes `q` into the URL via `setSearchParams` on each `onChange`, with
no debounce. Each character triggers a router navigation and a full table re-render; on a large
collection this is visibly janky. `replace: true` avoids history spam but not the work.

### P2 — "Timing" labels are frozen at module load

`PROPERTY_REFERENCE_TIME = Date.now()` is evaluated once. A tab left open past a schedule boundary
keeps saying "Starts …" for an event that has started. A render-time clock (or a minute tick) is
needed.

### P2 — Quick-order rules have no resolved preview

Operators can set a category rule and a cap, but the console never shows which products the rule
resolves to or how many exist. A typo in a category label silently yields an empty list. A
"resolves to N products" preview using the same rule engine would close the loop.

### P2 — Admin bundle is heavy

`npm run build` emits a 6.9 MB entry chunk (1.66 MB gzip) and Vite warns about it. Custom pages are
not route-split, so every operator loads the entire console before the first screen.

### P2 — Lint gate is red

`npm run lint` fails on `widgets/collection-customer-link.tsx:64` (`react-refresh/only-export-components`).
Build passes, so this is a CI/quality gate failure rather than a runtime one.

### P3 — Smaller items

- Settlement status renders raw (`reviewed`, `held`) instead of a human label.
- No filter, pagination or export on the statements list.
- `PageTabs` sets `role="tab"`/`aria-selected` but no `aria-controls`, `tabpanel`, or arrow-key
  roving.
- No operator-facing audit/history view, although the CMS records an operator audit trail.
- No layout preview; only banners have a customer preview.
- Product editorial and help articles are marked "Consumer pending" but are fully editable.

## Recommended sequence

1. **P0** — put the operator host behind Cloudflare Access and add HSTS, CSP, `X-Frame-Options`,
   `X-Content-Type-Options` at the edge.
2. **P1 quick wins** — fix the collection link, route both schedulers through the IST helpers,
   read commission rates from policy (or label them as illustrative constants with the live
   category names), add publish confirmation + unsaved guard to the layout editor, and align the
   sidebar label with the content-type label.
3. **P2** — debounce search, render-time timing labels, settlement horizontal scroll, rule preview,
   route splitting, lint fix.
4. **P3** — status humanisation, filters/export, tab semantics, audit view, layout preview, and an
   accurate delivery badge for editorial types.

No production change was made. Staging remains `production_release_authorized: false`.
