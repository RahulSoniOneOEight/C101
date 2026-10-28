# CHG-091 — Customer returns index, source verification

Date: 2026-10-29
Status: implemented and verified read-only against the staging Experience API. Staging deployment is
separately gated.

## What changed

| File | Change |
|---|---|
| `apps/web/app/returns/page.tsx` | New owner-scoped returns index: status, reason, line count, request date, link to detail, empty state. |
| `apps/web/lib/experience-api.ts` | Added `listMyReturns()` over `GET /v1/me/returns`. |
| `apps/web/app/layout.tsx` | Added Returns to the primary navigation. |

No API, schema, Admin or Seller change. No data written.

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | PASS |
| `next build` | PASS — `/returns` emitted alongside `/returns/[id]` |
| Browser QC at 390×844 and 1440×900 | 16/16 PASS |
| Console errors / failed requests | 0 / 0 |
| Overflow | none at either viewport |
| Mode | read-only |

The local production server ran against `https://api-staging.pinakaplay.cloud` as the owner of the
#137 order group. It listed that owner's 3 return requests (two approved, one rejected) with correct
dates and working links to the detail page. No other owner's data appeared.

Evidence: `local-browser-qc.json`, `local-screenshots/`, `tools/local-browser-qc.cjs`.

## Pending

- Deploy the customer web image and re-run the index against the deployed build.
- Empty state is code-reviewed but was not reachable for this owner (who has returns); it renders
  only when the API returns an empty list.

## Deferred

Return evidence upload, real refunds, Tryton disposition, carrier, settlement and production remain
outside this change.
