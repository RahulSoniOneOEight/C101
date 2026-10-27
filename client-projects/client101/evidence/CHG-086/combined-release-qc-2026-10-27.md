# CHG-086 product studio — combined-release QC (2026-10-27)

- **Environment:** staging
- **Release:** `399a969` — merge of CHG-086 (`bb7d904`) with U-003 (`ae0afee`)
- **Rollback:** `ecb01e1`
- **Purpose:** prove the product-studio update that was live before U-003 is still served by the
  combined release; nothing in this bundle reverts it.
- **Production:** untouched.

## What was checked

| Check | Result |
|---|---|
| Admin dashboard bundle contains the CHG-086 studio | **PASS** — `Import products` and the product-studio workspace render |
| CSV import page `/dashboard/products/import` | **PASS** — heading, template downloads, validate/import actions |
| CSV import API `POST /admin/buildkart/product-import` | **PASS** — 401 unauthenticated (route exists; admin auth required), not 404 |
| Product studio create workspace | **PASS** — Product name, Organisation, Variants & offers, Review |
| Studio detail on the smoke product | **PASS** — published, B2C live, B2B live, readiness rails |
| Smoke gate `create → price → live → storefront` | **PASS** — see below |
| Console errors | **0** |
| CHG-086 data changes | **intact** — archived products are draft; B2C/B2B channels active; “Pritesh jain” soft-deleted |

## Smoke gate (verbatim)

```
PASS login
PASS create filled
PASS variant saved — prod_01M5Z521VRV7T8SDNTPCZHYKTH
PASS pricing saved
PASS review live
PASS storefront — prod_01M5Z521VRV7T8SDNTPCZHYKTH @ 99900
PASS catalogue rule — commercial_readiness
PASS no console errors

SMOKE PASS prod_01M5Z521VRV7T8SDNTPCZHYKTH
```

Command: `node tooling/qa/product-studio-smoke.mjs` against
`https://ops-staging.pinakaplay.cloud`.

## Read-only studio check (verbatim)

```
PASS CSV import page
PASS CSV template action
PASS CSV validation copy
PASS Product name field
PASS Organisation section
PASS Variants & offers section
PASS Review section
PASS Studio detail loads
PASS No console errors
```

## Screenshots

- `screenshots/products-import.png` — CSV import page with template, validation and import actions.
- `screenshots/products-new.png` — product studio create workspace.
- `screenshots/product-studio-live.png` — the smoke product in the studio:
  published / B2C live / B2B live, sections and readiness rails.

## Notes

- The smoke created **one** staging test product, `prod_01M5Z521VRV7T8SDNTPCZHYKTH`
  (“Smoke 594475”, INR 999). No real money, no stock movement.
- The combined release was built `--no-cache`; both feature markers were verified in the images
  before `current` was switched:
  - medusa: CHG-086 import page/route + U-003 promotion script/offers + admin bundle;
  - experience-api: U-003 auto-offer + CHG-086 money boundary.
- The U-003 QC/acceptance scripts received test-only catalogue-pagination fixes after the build
  and ran through read-only bind mounts; the runtime image is unchanged.
