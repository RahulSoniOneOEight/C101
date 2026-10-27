# U-003 / B002 — closeout (combined release with CHG-086)

- **Bundle:** U-003 (B002 — Flat5% automatic offer + ORDER10 code)
- **Lane / release:** B / `api+ui` + promotion data (no schema)
- **Worktree:** `C:\Users\LENOVO\AppData\Local\Temp\opencode\bk-u003-promo-codes`
- **Branch:** `reconcile/u003-chg086` (U-003 commits merged with CHG-086)
- **Base:** `33c6add` (host-verified staging release 2026-10-27T12:55Z)
- **Runtime release:** **`399a969`** (`/opt/buildkart-releases/release-399a969`)
- **Rollback:** `ecb01e1` (CHG-086, the release running before the combined deploy)
- **Deploy:** staging only, under the requester's combined gate
  (`DEPLOY APPROVED: U-003+CHG-086 release 399a969 … Rollback ecb01e1. Staging only.`)
- **Production:** untouched, forbidden

## Outcome

Every new cart auto-receives a removable `Flat5%` (5% off items). A manual code replaces it,
one offer at a time; removing the active code leaves 0% and does not bring Flat5% back. `ORDER10`
is live as a 10% code. `PLY5` is retired (inactive, no longer automatic, history retained).

The CHG-086 product-studio update is **preserved in the same release**: CSV import, the studio
workspace, pricing, readiness and the smoke gate all pass (see §CHG-086 and
`evidence/CHG-086/combined-release-qc-2026-10-27.md`).

Runtime U-003 QC passed **12/12** on the combined release (`qc-output.txt`), including a simulated
checkout whose order total records the 10% discount with no reservation.

## Deployment history (important)

| Time (UTC) | Event |
|---|---|
| 14:27 | U-003 `1951cea` switched live; promotion data applied; QC **12/12 PASS** |
| 15:59–16:06 | A concurrent CHG-086 deploy created `release-ecb01e1` and recreated `medusa-api`/`experience-api` from it **without switching `current`** |
| 16:04–16:06 | Running containers became CHG-086; `current` still read `1951cea`; U-003 auto-offer was no longer in the running API |
| 16:37 | Collision identified: live probe showed no Flat5% on a new cart; CHG-086 routes present |
| 17:00+ | Combined candidate `399a969` built `--no-cache`, markers verified, switched, QC passed |

The combined release is the fix: both feature sets are in the image and in `current`.

## G1 baseline (before any write)

| Item | Value |
|---|---|
| Branch | `feat/u003-promo-codes` |
| HEAD | `33c6adde9c6539225f230040e36720ce6e36267b` |
| `git status` | clean |
| Staging `current` | `release-33c6add` |
| `medusa-api` / `experience-api` | running, healthy |
| Host disk | 164 GB free |

## G5 scoped release — `399a969`

`399a969` is a merge commit:

- parent 1: `bb7d904` — CHG-086 product studio (the line that was running)
- parent 2: `ae0afee` — U-003 (promo offers + evidence)

One conflict, `services/experience-api/src/index.ts`, resolved by keeping CHG-086's
`medusaToMinorOr` money boundary **and** U-003's promotions / `auto_offer` marker.

`git diff --name-only 33c6add..399a969` includes both bundles. U-003's files are exactly the
allowlist from B002 (Experience API promotions, backend merchandising config/tests, Flutter
models/panel/test, U-003 evidence). CHG-086's files are the product-studio update that was already
reviewed on `feat/bt-sku-pairs`.

### Image markers verified before switching

| Image | Marker | Result |
|---|---|---|
| medusa | `apps/admin/src/routes/products/import/page.tsx` | yes |
| medusa | `packages/api/src/api/admin/buildkart/product-import/route.ts` | yes |
| medusa | `configure-staging-merchandising.ts` contains `U-003 PROMO_STATE` | yes |
| medusa | `offer-patterns.ts` contains `PILOT_FLAT_OFFERS` | yes |
| medusa | admin bundle contains `Import products` | yes |
| experience-api | `index.ts` contains `AUTOMATIC_OFFER_CODE` | yes |
| experience-api | `commerce/money.ts` exists (CHG-086 money boundary) | yes |
| experience-api | `promo-code-qc.ts` contains the settle/exact-amount fixes | yes |
| experience-api | `promotion-acceptance.ts` contains the exact-amount fix | yes |

Build was `--no-cache` for all four services (`BUILD_EXIT=0`), following the CHG-086 stale-layer
lesson.

## Requirement ledger

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R1 | `FLAT5` active, order-level 5%, no category/group/channel rule, B2C+B2B | **PASS** | live `PROMO_STATE` (order/5, no rules); QC R1 across Passenger Car + Plywood; R9 B2B |
| R2 | `PLY5` inactive, no new cart receives it, history untouched | **PASS** | live state `inactive`, `is_automatic=false`; QC R2 (absent + 422) |
| R3 | `ORDER10` active, order-level 10%, code-based, usage limit | **PASS** | live state (order/10, limit 5000, no rules); QC R3 |
| R4 | New cart with a line shows Flat5% with no action, automatic marker | **PASS** | QC R4: `is_automatic=true`, label `Flat5%`, 5% of INR 879.12 = INR 43.96 |
| R5 | Remove Flat5%; total rises 5 points; stays removed on re-fetch/quantity/address/checkout | **PASS** | QC R5: 0% after removal, re-fetch, quantity change and address/shipping |
| R6 | ORDER10 after removal is exactly 10%, Flat5% absent, no 15% cart | **PASS** | QC R6: 10% of INR 2,195.14 = INR 219.51, single offer |
| R7 | A code replaces the current offer; no cart over 10% | **PASS** | QC R7: ORDER10→ORDER5→ORDER10, exact amounts |
| R8 | Removing the active code leaves 0%; a new cart re-applies Flat5% | **PASS** | QC R8 (0% after re-fetch) + R8b (fresh B2B cart 5%) |
| R9 | B2B: Flat5% applies, TRADE7 replaces it, gating unchanged, non-trade rejected | **PASS** | QC R9 (non-trade 422) + R9b (TRADE7 7% of INR 1,517.00 = INR 106.19) |
| R10 | One simulated checkout with ORDER10 records the discount; no money/stock effect | **PASS** | order `og_01M5Z4YDTS57Z0ES1NJ7GZRDZ6`: INR 2,173.63 = 2,195.14 − 219.51 + 198.00; simulated payment; `reservation_status=not_started` |
| R11 | QC script asserts exact rupee amounts for R1–R10 | **PASS** | `qc-output.txt` §3; 12 checks exact to the minor unit |
| R12 | Existing tests updated; typecheck; Flutter analyze/test; zero console errors; panel screenshot | **PASS-CODE** | typecheck 0 · Flutter analyze clean · **285 tests** · acceptance PASS · admin console errors 0. U-003 app cart screenshots still require a local Flutter session (app not hosted on staging). |

## CHG-086 preservation

| Check | Result |
|---|---|
| CSV import page + template/validate actions | **PASS** — `screenshots/products-import.png` |
| Product studio create workspace | **PASS** — `screenshots/products-new.png` |
| Studio detail (smoke product, B2C/B2B live) | **PASS** — `screenshots/product-studio-live.png` |
| `POST /admin/buildkart/product-import` | **PASS** — 401 unauthenticated (route exists) |
| Smoke gate create → price → live → storefront | **PASS** — `prod_01M5Z521VRV7T8SDNTPCZHYKTH`, storefront 99900 |
| Catalogue rule | `commercial_readiness` |
| Console errors | **0** |
| Data: archived products / channels / soft-deleted channel | **intact** |

## Verification (staging)

| Check | Result |
|---|---|
| `promo-code-qc.ts` | **PASS 12/12** |
| `promotion-acceptance.ts` | **PASS** |
| CHG-086 product-studio smoke | **PASS** |
| CHG-086 read-only studio check | **PASS** |
| Health | api 200 · ops 200 · dashboard 200 · seller 200 · app 200 |
| Containers | medusa-api healthy · experience-api healthy · worker/event-workers running |
| Typecheck (host image) | exit 0 |
| Flutter analyze | No issues |
| Flutter tests | 285 passed (full suite, goldens included) |
| Flutter web release build | PASS (`Built build\web`) |

### Test data (staging)

- B2C QC cart: `cart_01M5Z4W7F5A9WHTFY4GEBR1AZM`
- B2B QC cart: `cart_01M5Z4Y2CEGVTVD3T8D10EPS6A`
- Simulated order: `og_01M5Z4YDTS57Z0ES1NJ7GZRDZ6` (INR 2,173.63; no reservation)
- CHG-086 smoke product: `prod_01M5Z521VRV7T8SDNTPCZHYKTH` (“Smoke 594475”, INR 999)
- Earlier U-003 QC runs created additional staging carts; one earlier simulated order came from
  the pre-fix money-scale check. All test-only; no money, no stock.

## Evidence tooling (test-only, after the 399a969 build)

The runtime image is `399a969`. The QC/acceptance scripts needed catalogue pagination and
money-scale normalisation because the merged CHG-086 catalogue and money boundary changed the
fixtures. These are **test-only** commits on `reconcile/u003-chg086`:

| Commit | Change |
|---|---|
| `c8453ac` | QC: choose offers across the live catalogue |
| `e2ae082` | QC: read offers from the B2C catalogue |
| `907cc68` | QC: 3s settle; round expected discounts for the merged money boundary |
| `c4c7503` | QC: normalise order total to the cart money scale |
| `fbe3d82` | Acceptance: read offers across catalogue pages |

The corrected scripts were executed through read-only bind mounts; no runtime file changed after
the build.

## Deferred register

| Item | Why | Owner / when |
|---|---|---|
| U-003 cart/checkout screenshots (`Flat5% · Auto` + remove, ORDER10) | Flutter app is source-only on staging (`app-staging` is the Next.js storefront); needs a local app session | control-room live cart QC / requester |
| Formal CHG number for the U-003 commercial rule | Requester assigns it | control room / requester |
| Production release | Forbidden | human authorisation only |

## Residual risks

1. **Concurrent deploy collision.** The first U-003 release (`1951cea`) was overwritten by a
   CHG-086 deploy that did not switch `current`. The combined release fixes the outcome; the
   process fix is a single deploy lock (control room). `current` and the running containers now
   match at `399a969`.
2. **Rapid API pacing.** Medusa's promotion workflow needs time to settle; the QC uses 3s between
   user-style actions. The app blocks while an apply/remove is in flight. A sub-second automated
   loop can briefly observe the previous offer.
3. **Money boundary.** Staging uses `MEDUSA_MONEY_UNITS=major`; the merged API converts to minor
   units at the boundary. The QC normalises the order-group total to the cart scale. A future
   change to that env or helper needs the same QC.
4. **PLY5 history.** Inactive, not deleted; existing adjustments/orders untouched.
5. **Budget.** Pilot Flat Offers holds INR 500,000; if exhausted, Flat5% stops applying.
6. **Pre-existing red test.** `staging-merchandising-test.ts` was already red at `33c6add` (stale
   `BK-STG-PROMO-*` codes; path/fixture outside the allowlist). Not changed.
7. **U-003 cart summary label.** `cart_screen.dart` is outside the scope lock; its one-line
   summary still prints `FLAT5`. The offers panel and API label are `Flat5%`.
8. **Multi-code POST.** A request with multiple codes now returns 400; the app sends one.

## Release and rollback

- **Runtime release:** `399a969` — `/opt/buildkart-releases/release-399a969`
- **Rollback:** `ecb01e1` — `/opt/buildkart-releases/release-ecb01e1`
- **Mechanism:** Experience API + Medusa image, Flutter web build (artifact), idempotent promotion
  data script; proxy restart after healthy containers.
- **Production:** untouched and forbidden.
