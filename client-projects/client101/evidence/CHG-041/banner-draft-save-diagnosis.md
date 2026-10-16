# CHG-041 Banner Draft Save Diagnosis

**Date:** 16 October 2026
**Change contract:** CHG-041 revision 2
**Environment:** Staging diagnosis and local validation
**Status:** Fix locally validated; staging deployment pending; production unauthorized

## Confirmed failure

The operator attempted to save the existing `secondary-clearance-sale` banner draft three times.
Medusa returned HTTP `500`, and all three private CMS mutations were recorded as failed. No publish
operation was invoked by the editor.

The CMS and PostgreSQL logs identify the failing column and value:

- document ID: `sobtrqtdlynx04b556kshskg`;
- field: optional banner `segments` JSON;
- PostgreSQL parameter: empty string;
- database result: `invalid input syntax for type json` because the input ended before a valid JSON
  value began.

Audit references for the operator attempts are `de7101455739e8cd596169f48ae50e7b`,
`0461f012a513e159f49f78a72c44ea34` and `74adf61910da00067fb4c620a63af02e`.
They contain payload hashes and status only; no CMS credential or content payload is exposed.

## Root cause and correction

The draft editor accepts structured JSON. A JSON textarea containing an empty JSON string (`""`)
parses successfully in the browser but is not a valid value for PostgreSQL's JSON update path as
processed by Strapi. The correction is defensive at both boundaries:

1. the Mercur editor converts an empty optional JSON string to `null` before mutation;
2. the private CMS allowlist independently normalizes blank JSON strings to `null` before Strapi;
3. any later server-side mutation failure returns an actionable correlation reference while the raw
   error remains only in private logs and the governed audit row.

The integration smoke test now submits the exact empty-string JSON case instead of merely omitting
the field. It also forces a rejected mutation and checks that the response includes its correlation
reference without database details.

## Safety verification

- A controlled staging request setting only `segments: null` succeeded, confirming null is the safe
  cleared representation. It changed draft `updatedAt` only and did not publish content.
- The corresponding published row retained its prior publication timestamp.
- No CMS secret was printed, committed or sent to the browser.
- The public presentation remained sourced from the published CMS projection; explicit publication
  is still required for draft changes.

## Local checks

- `npm run build` passed in `services/cms`.
- `bun run lint` passed in `services/backend/apps/admin`.
- `bun run build` passed in `services/backend/apps/admin`.
- The targeted CMS operator client Jest suite passed: 4 tests.
- `node --check scripts/operator-content-smoke.mjs` passed.

Staging deployment and human save/reload verification remain required. No production deployment or
authorization was performed.
