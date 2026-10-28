# CHG-089 — Customer return initiation, source verification

Date: 2026-10-29
Status: implemented; source-verified against the staging Experience API read-only. Staging deployment
is separately gated.

## What changed

| File | Change |
|---|---|
| `apps/web/lib/experience-api.ts` | Added `CustomerReturnEligibilityLine`, `return_eligibility` on the order detail, and `createMyReturn()` with an idempotency key. |
| `apps/web/app/api/returns/route.ts` | New server route: reads the HTTP-only session cookie, validates shape, calls the owner-scoped API, maps 400/401/409/5xx to readable errors. |
| `apps/web/app/orders/[id]/returns/new/page.tsx` | New page: server-computed eligibility, return-window date, boundary wording, empty state when nothing is returnable. |
| `apps/web/app/orders/[id]/returns/new/return-form.tsx` | New client form: quantity per eligible line, allowed reasons, refund/replacement, optional note, stable idempotency key, disabled at zero units. |
| `apps/web/app/orders/[id]/page.tsx` | Per-line returnable hint and a "Start a return" action when eligible units exist. |
| `apps/web/app/globals.css` | Form field, line picker and action styles at 390 and 1440. |

No Experience API, schema, event, Admin or Seller change. No provider integration.

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | PASS |
| `next build` (production) | PASS — `/orders/[id]/returns/new` and `/api/returns` emitted |
| Browser QC, 390×844 and 1440×900 | 18/18 PASS |
| Console errors | 0 |
| Unexpected failed requests | 0 |
| Horizontal overflow | none at either viewport |
| Mode | read-only: no return submitted, no data written |

The local production server ran on `localhost:3100` with
`EXPERIENCE_API_BASE_URL=https://api-staging.pinakaplay.cloud` and signed in as the owner of order
`cart_01M5Y54HVDTDJ2MTP6X45Q5W9R` (#137 group). It rendered against the real staging eligibility:
8 returnable units across 6 items, the already-returned iPhone correctly absent, allowed reasons
`Arrived damaged`, `Wrong item`, `Not as described`.

Evidence: `local-browser-qc.json`, `local-screenshots/`, `tools/local-browser-qc.cjs`.

## Not yet proven

- Submitting the form and landing on the created return page against a deployed build.
- The API's rejection path is covered by existing unit/acceptance tests but was not re-exercised here.
- Evidence upload, real refunds, Tryton disposition, carrier and settlement remain deferred.

## Next gate

Rebuild the customer web image, recreate `web`, and run the submit path with one temporary return on
a delivered staging order, then remove it and re-check the zero-effect counts. Requires explicit
staging deployment authorization.
