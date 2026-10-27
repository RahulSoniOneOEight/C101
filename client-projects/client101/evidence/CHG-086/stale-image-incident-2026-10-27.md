# CHG-086 — stale image incident and final verification

- **Date:** 2026-10-27
- **Environment:** staging only; production untouched
- **Affected surfaces:** Admin/Seller dashboard bundle, Experience API
- **Final staging release:** `ecb01e1` (images), smoke-gate change `71acdb4`

## 1. What appeared to be wrong

After a series of successful `docker compose build` runs, the deployed Admin dashboard still showed
an older Product Studio, the **Import CSV** entry point was missing, and Review reported that a newly
created product was **not live**. The git history contained every change, and local typechecks passed.

Reported symptom: "product page and import updates from this session are lost".

## 2. Root cause

The images were built and deployed, but **both containers served stale code**:

| Image | What was served | Behaviour marker |
|---|---|---|
| `buildkart-hosted-pilot-medusa` | an older dashboard bundle | `Import CSV`, `Schedule this price`, `Content, variants, pricing…` all absent |
| `buildkart-hosted-pilot-experience-api` | a build predating the readiness cutover | `/v1/products` returned `visibility_rule: null` and `count: null` |

The build log reported `Image buildkart-hosted-pilot-medusa Built` and
`Image buildkart-hosted-pilot-experience-api Built` in both cases. The layer cache produced an image
whose contents did not match the checked-out source.

A second, independent factor made the dashboard look stale even when the API was current: Medusa
serves `…/.medusa/server/public/admin`, while the freshly built panel is written to
`…/.medusa/server/dashboards/admin/dist`. The served `index.html` referenced a different asset hash
from the freshly built one.

## 3. Fix

1. Rebuilt both images with the cache disabled:

   ```bash
   docker compose -f docker-compose.hosted.yml build --no-cache medusa-api
   docker compose -f docker-compose.hosted.yml build --no-cache experience-api
   docker compose -f docker-compose.hosted.yml up -d --no-deps --force-recreate \
     medusa-api medusa-worker experience-api event-workers
   ```

2. Verified **behaviour markers** instead of trusting the build log:
   - dashboard assets contain `Import CSV`, `Schedule this price`, `Content, variants, pricing…`
   - `/v1/products` returns `visibility_rule: "commercial_readiness"` and a numeric `count`

## 4. Regression found during verification

Creating a product before the channel list finished loading sent an explicit **empty**
`sales_channel_ids`, which the server correctly treated as "no channel" — so the product was
published but never live.

Fixed in `ecb01e1`: on create, an untouched channel selection is omitted so the server applies the
default B2C channel; an explicit selection, or any edit, still sends the chosen list.

## 5. Verification (live staging)

| Check | Result |
|---|---|
| Dashboard bundle markers | present (`Import CSV`, pricing schedule, workspace header) |
| Experience API rule | `commercial_readiness` |
| Catalogue count | 249 |
| Import surface | button on Products, page renders, 2 template downloads |
| Pricing | B2C + B2B, tiers, `Schedule this price`, "Live as soon as it is saved" |
| Create → price → live | **SMOKE PASS**, storefront ₹999 |
| Smoke product | `prod_01M5Z1VQD77PMVHHY4A283DQRD` (retained) |
| Console errors | none |

## 6. Guardrails added

- `tooling/qa/product-studio-smoke.mjs` now fails when the catalogue is not
  `commercial_readiness`, so a stale Experience API deploy cannot pass.
- `update-delivery-framework-v2.md` §14 gained the stale-layer rule: never trust "Image built";
  assert a behaviour marker; rebuild `--no-cache` when a marker is missing; verify each image when
  two changed together.

## 7. Current state

- All CHG-086 commits are present and pushed (`ca87dfe … 71acdb4`).
- Working tree clean at the time of writing.
- QC records retained: `prod_01M5X2Q7…`, `prod_01M5X38G…`, `prod_01M5X4VM8…`, `prod_01M5Y0R6…`,
  `prod_01M5Y3XC…`, `prod_01M5Z1VQ…`.
- Staging admin password rotation explicitly waived by the requester.

## 8. Residual risks

- Docker layer caching can reproduce this on the next bundle; the smoke gate mitigates but the
  `--no-cache` rule should be followed whenever a marker is missing.
- `public/admin` vs `dashboards/admin/dist` remains an implementation detail worth standardising in
  the image build.
