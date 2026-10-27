# U-003 / B002 — closeout

- **Bundle:** U-003 (B002 — Flat5% automatic offer + ORDER10 code)
- **Lane / release:** B / `api+ui` + promotion data (no schema)
- **Worktree:** `C:\Users\LENOVO\AppData\Local\Temp\opencode\bk-u003-promo-codes`
- **Branch:** `feat/u003-promo-codes`
- **Base:** `33c6add` (host-verified staging release 2026-10-27T12:55Z)
- **Runtime release:** **`1951cea`** (`/opt/buildkart-releases/release-1951cea`)
- **Rollback:** `33c6add` — not used
- **Deploy:** staging only, executed under the requester's gate
  (`DEPLOY APPROVED: U-003 release 1951cea … Staging only.`)
- **Production:** untouched, forbidden

## Outcome

Every new cart auto-receives a removable `Flat5%` (5% off items). A manual code replaces it,
one offer at a time; removing the active code leaves 0% and does not bring Flat5% back. `ORDER10`
is live as a 10% code. `PLY5` is retired (inactive, no longer automatic, history retained).

Runtime QC passed **12/12** on staging (`qc-output.txt`), including a simulated checkout whose
order total records the 10% discount with no reservation.

## G1 baseline (before any write)

| Item | Value |
|---|---|
| Branch | `feat/u003-promo-codes` |
| HEAD | `33c6adde9c6539225f230040e36720ce6e36267b` |
| `git status` | clean |
| Staging `current` | `release-33c6add` |
| `medusa-api` / `experience-api` | running, healthy |
| Host disk | 164 GB free |

## G5 scoped release

`git log --oneline 33c6add..1951cea` — one commit:

```
1951cea fix(promotions): use the typed campaign budget update (U-003)
```

(The branch also carries the earlier feature commit `fd52d6a` plus four test/evidence commits; see
"Evidence tooling" below.)

`git diff --name-only 33c6add..1951cea`:

| Changed path | Allowed by brief | Purpose |
|---|---|---|
| `services/experience-api/src/index.ts` | yes | auto-apply FLAT5, one-offer replacement/removal, opt-out metadata, cart marker |
| `services/experience-api/src/scripts/promotion-acceptance.ts` | yes | updated regression |
| `services/experience-api/src/scripts/promo-code-qc.ts` | yes (new) | exact-amount QC for R1–R10 |
| `apps/prototype_app/lib/domain/models.dart` | yes | carries the API `label` through the model and local cache |
| `apps/prototype_app/lib/widgets/promotion_panel.dart` | yes | `Flat5% · Auto` is an `InputChip` with delete |
| `apps/prototype_app/test/cart_promotions_test.dart` | yes | label round-trip + removable auto chip |
| `services/backend/.../staging-merchandising/presets.ts` | yes | `PLY5` inactive / not automatic; optional `status` |
| `services/backend/.../staging-merchandising/offer-patterns.ts` | yes | FLAT5, ORDER10, Pilot Flat Offers + invariants |
| `services/backend/.../scripts/configure-staging-merchandising.ts` | yes | idempotent campaign/offer apply + before/after audit |
| `services/backend/.../scripts/merchandising-pilot-flat-offers-test.ts` | yes (new) | declarative configuration test |
| `client-projects/client101/evidence/U-003/**` | yes | decision record, state, QC, closeout |

No file outside the allowlist. No no-touch path touched (`apps/web`, `services/cms`,
`services/hosted`, migrations, env files, `workflow-state.yaml`, other promotions).

## Deploy record

| Step | Result |
|---|---|
| First approved candidate `fd52d6a` | **Not released** — Medusa image build failed `TS2353` (campaign budget `id` not allowed by the DTO). Staging untouched. |
| Corrected candidate `1951cea` | Approved; image build `BUILD_EXIT=0` (medusa, medusa-worker, experience-api, event-workers) |
| Immutable release worktree | `/opt/buildkart-releases/release-1951cea`, HEAD `1951cea`; `.env` copied from the previous release |
| `current` switch | `release-1951cea` |
| Containers | `medusa-api`, `medusa-worker`, `experience-api`, `event-workers` recreated; all healthy |
| Promotion data | `configure:staging-merchandising` exit 0 at 14:29:11–14:29:15Z; `PROMO_STATE before/after` captured |
| Proxy | restarted |
| Health | api 200 · ops 200 · dashboard 200 · seller 200 · app 200 |
| Runtime QC | 12/12 PASS |
| Acceptance | PASS |
| Hosted acceptance | 11/11 PASS |
| Rollback | `33c6add` unused |

## Requirement ledger

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R1 | `FLAT5` active, order-level 5%, no category/group/channel rule, B2C+B2B | **PASS** | live `PROMO_STATE` (order/5, no rules); QC R1 across two categories; R9 B2B |
| R2 | `PLY5` inactive, no new cart receives it, history untouched | **PASS** | live state `inactive`, `is_automatic=false`; QC R2 (absent + 422) |
| R3 | `ORDER10` active, order-level 10%, code-based, usage limit | **PASS** | live state (order/10, limit 5000, no rules); QC R3 |
| R4 | New cart with a line shows Flat5% with no action, automatic marker | **PASS** | QC R4: `is_automatic=true`, label `Flat5%`, 5% of INR 15.17 = INR 0.76 |
| R5 | Remove Flat5%; total rises 5 points; stays removed on re-fetch/quantity/address/checkout | **PASS** | QC R5: 0% after removal, re-fetch, quantity change and address/shipping; checkout later with ORDER10 |
| R6 | ORDER10 after removal is exactly 10%, Flat5% absent, no 15% cart | **PASS** | QC R6: 10% of INR 34.71 = INR 3.47, single offer |
| R7 | A code replaces the current offer; no cart over 10% | **PASS** | QC R7: ORDER10→ORDER5→ORDER10, exact amounts |
| R8 | Removing the active code leaves 0%; a new cart re-applies Flat5% | **PASS** | QC R8 (0% after re-fetch) + R8b (fresh B2B cart 5%) |
| R9 | B2B: Flat5% applies, TRADE7 replaces it, gating unchanged, non-trade rejected | **PASS** | QC R9 (non-trade 422) + R9b (TRADE7 7% of INR 15.17 = INR 1.06) |
| R10 | One simulated checkout with ORDER10 records the discount; no money/stock effect | **PASS** | order `og_01M5YWHA0HP53H6MK9QVARFBZK`: INR 33.22 = 34.71 − 3.47 + 1.98; simulated payment; `reservation_status=not_started` |
| R11 | QC script asserts exact rupee amounts for R1–R10 | **PASS** | `qc-output.txt` §2; 12 checks exact to the paise |
| R12 | Existing tests updated; typecheck; Flutter analyze/test; zero console errors; panel screenshot | **PASS-CODE** | typecheck 0 · Flutter analyze clean · 282 tests + widget test · acceptance PASS. Runtime console and screenshots are in the deferred register (app is not hosted on staging). |

## Verification (post-deploy, staging)

| Check | Result |
|---|---|
| `promo-code-qc.ts` | **PASS 12/12** (exact minor-unit amounts) |
| `promotion-acceptance.ts` | **PASS** |
| Hosted acceptance | **11/11 PASS** |
| Health | api 200 · ops 200 · dashboard 200 · seller 200 · app 200 |
| Containers | medusa-api healthy · experience-api healthy · worker/event-workers running |
| Typecheck (host image) | exit 0 |
| Flutter analyze | No issues |
| Flutter tests | 282 passed (full suite, goldens included) |
| Flutter web release build | **PASS** (`Built build\web`) |
| Declarative U-003 test | PASS |

### Test data (staging)

- B2C cart (QC): `cart_01M5YWG73GHM4CBBR9EK7ZFDJP`
- B2B cart (QC): `cart_01M5YWH3SZCJZ8PCNM2TBMDBR2`
- Simulated order: `og_01M5YWHA0HP53H6MK9QVARFBZK`
- No real money, no stock reservation (`reservation_status=not_started`).

## Evidence tooling (test-only, after deploy)

Two evidence scripts needed corrections after the first run; the **runtime image is unchanged at
`1951cea`**. The corrected scripts were executed through read-only bind mounts:

| Commit | Change |
|---|---|
| `ecb6e38` | QC compares exact decimal minor units (Medusa keeps fractional paise) and waits for the promotion workflow between user-style actions |
| `aa9aa6d` | QC selects one delivery option per seller (multi-seller cart) |
| `8290841` | Same exact-decimal comparison in `promotion-acceptance.ts` |

The first QC run also exposed that the evidence script fired mutations faster than the storefront
ever can; the deployed API handled the user-paced sequence correctly (see §Residual risks).

## Deferred register

| Item | Why | Owner / when |
|---|---|---|
| Cart/checkout screenshots showing `Flat5% · Auto` + remove and ORDER10 | Flutter app is source-only on staging (`app-staging` is the Next.js storefront); needs a local app session | control-room live cart QC / requester |
| Zero console errors in the running app | same reason | control-room live cart QC |
| Formal CHG number | Requester assigns it | control room / requester |
| Production release | Forbidden | human authorisation only |

## Residual risks

1. **Rapid API race.** The QC originally fired apply/remove within milliseconds; Medusa's
   recalculation workflows overlapped and briefly reported a stale 5%. At user pace (≥1.2 s
   between actions, and the app blocks while busy) the behaviour is correct. The API removes the
   previous code before applying the new one; the final cart state is single-offer.
2. **Fractional paise.** Medusa returns percentage discounts as decimals (`75.85` paise); the app
   model stores integer minor units and truncates sub-paise fractions in display. This is
   pre-existing and worth <1 paise; the QC asserts the exact server amount.
3. **PLY5 history.** Inactive, not deleted; existing adjustments/orders untouched.
4. **Budget.** Pilot Flat Offers holds INR 500,000; if exhausted, Flat5% stops applying.
5. **Pre-existing red test.** `staging-merchandising-test.ts` was already red at `33c6add` (stale
   `BK-STG-PROMO-*` codes; path/fixture outside the allowlist). Not changed.
6. **Cart summary label.** `cart_screen.dart` is outside the scope lock; its one-line summary still
   prints `FLAT5`. The offers panel and API label are `Flat5%`.
7. **Multi-code POST.** A request with multiple codes now returns 400; the app sends one.

## Release and rollback

- **Runtime release:** `1951cea` — `/opt/buildkart-releases/release-1951cea`
- **Rollback:** `33c6add` — `/opt/buildkart-releases/release-33c6add`
- **Mechanism:** Experience API + Medusa image, Flutter web build (artifact), idempotent promotion
  data script; proxy restart after healthy containers.
- **Production:** untouched and forbidden.
