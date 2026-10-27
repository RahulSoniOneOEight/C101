# U-003 / B002 — closeout

- **Bundle:** U-003 (B002 — Flat5% automatic offer + ORDER10 code)
- **Lane / release:** B / `api+ui` + promotion data (no schema)
- **Worktree:** `C:\Users\LENOVO\AppData\Local\Temp\opencode\bk-u003-promo-codes`
- **Branch:** `feat/u003-promo-codes`
- **Base:** `33c6add` (host-verified staging release 2026-10-27T12:55Z)
- **Release candidate:** `fd52d6a63bdd3b3113b9f86e5901307aa87d1413` (`fd52d6a`)
- **Commit range:** `33c6add..fd52d6a` (one commit)
- **Deploy:** **not performed**. No staging data was written. No production access.
- **Status:** code complete, static verification green, runtime QC pending the human deploy gate.

## G1 baseline

| Item | Value |
|---|---|
| Branch | `feat/u003-promo-codes` |
| HEAD | `33c6adde9c6539225f230040e36720ce6e36267b` |
| `git status` | clean (no untracked or modified files) |
| Base relationship | HEAD == brief base `33c6add` |
| Environment | staging only; production forbidden |

## G2 scope lock — diff mapping

`git diff --name-only 33c6add..fd52d6a`:

| Changed path | Allowed by brief | Purpose |
|---|---|---|
| `services/experience-api/src/index.ts` | yes | auto-apply FLAT5, one-offer replacement/removal, opt-out metadata, cart marker |
| `services/experience-api/src/scripts/promotion-acceptance.ts` | yes | updated regression for the new behaviour |
| `services/experience-api/src/scripts/promo-code-qc.ts` | yes (new) | R1–R10 QC with exact amounts |
| `apps/prototype_app/lib/domain/models.dart` | yes | carries the API `label` through the model and local cache |
| `apps/prototype_app/lib/widgets/promotion_panel.dart` | yes | `Flat5% · Auto` is an `InputChip` with a delete action |
| `apps/prototype_app/test/cart_promotions_test.dart` | yes | label round-trip + removable auto chip widget test |
| `services/backend/.../staging-merchandising/presets.ts` | yes | `PLY5` inactive, no longer automatic; optional `status` field |
| `services/backend/.../staging-merchandising/offer-patterns.ts` | yes | `FLAT5`, `ORDER10`, "Pilot Flat Offers" campaign + invariants |
| `services/backend/.../scripts/configure-staging-merchandising.ts` | yes | idempotent campaign/offer apply + before/after promotion audit |
| `services/backend/.../scripts/merchandising-pilot-flat-offers-test.ts` | yes (new) | pure declarative proof of the U-003 configuration |
| `client-projects/client101/evidence/U-003/**` | yes | this closeout, decision record, state, QC placeholder |

No file outside the allowlist changed. No no-touch path (`apps/web`, `services/cms`, `services/hosted`, migrations, env files, `workflow-state.yaml`, other promotions) was touched.

## Requirement ledger

Statuses are the ceiling before deploy: **PASS-CODE** means code/type/build verified, runtime not exercised. No requirement is claimed PASS.

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R1 | `FLAT5` active, order-level 5%, no category/group/channel rule, B2C+B2B | **PASS-CODE** | `offer-patterns.ts` declaration + `merchandising-pilot-flat-offers-test.ts` (order target, no rules); QC R1 across two categories, R9 on B2B; live `PROMO_STATE` line pending |
| R2 | `PLY5` inactive, no new cart receives it, history untouched | **PASS-CODE** | `presets.ts` status `inactive`, `automatic:false`; declarative test; QC R2 (absent + 422); no delete in the script |
| R3 | `ORDER10` active, order-level 10%, code-based, usage limit | **PASS-CODE** | declaration (limit 5,000) + declarative test; QC R3 |
| R4 | New cart with a line shows Flat5% with no action, automatic marker | **PASS-CODE** | `applyAutomaticOffer` on first line + metadata marker; widget test; QC R4 |
| R5 | Remove Flat5%; total rises 5 points; stays removed on re-fetch/quantity/address/checkout | **PASS-CODE** | DELETE sets sticky opt-out; QC R5 (exact rise + three repeated reads) |
| R6 | ORDER10 after removal is exactly 10%, Flat5% absent, no 15% cart | **PASS-CODE** | remove-then-apply; single-offer guard; QC R6 |
| R7 | A code replaces the current offer; no cart over 10% | **PASS-CODE** | apply path removes existing codes; QC R7 (`ORDER10→ORDER5→ORDER10`) |
| R8 | Removing the active code leaves 0%; a new cart re-applies Flat5% | **PASS-CODE** | QC R8 (0% after re-fetch) + R8b (fresh B2B cart) |
| R9 | B2B: Flat5% applies, TRADE7 replaces it, trade gating unchanged, non-trade rejected | **PASS-CODE** | QC R9 (non-trade 422) + R9b (B2B replacement, 7% exact) |
| R10 | One simulated checkout with ORDER10 records the discount; no money/stock effect | **PASS-CODE** | QC R10 (order total == discounted cart total, simulated payment, `reservation_status=not_started`) |
| R11 | QC script asserts exact rupee amounts for R1–R10 | **PASS-CODE** | `promo-code-qc.ts` (typecheck); runtime output pending in `qc-output.txt` |
| R12 | Existing promotion tests updated; typecheck; Flutter analyze/test; zero console errors; screenshot | **PASS-CODE** | see verification below; screenshot + runtime console deferred to staging |

## Verification run (local, 2026-10-27)

| Check | Command | Result |
|---|---|---|
| Experience API typecheck | `cd services/experience-api && bunx tsc --noEmit` | **PASS** (exit 0) |
| U-003 declarative configuration test | `cd services/backend/packages/api && bun run src/scripts/merchandising-pilot-flat-offers-test.ts` | **PASS** (`FLAT5 5% + ORDER10 10% ... PLY5 inactive and not automatic; ceiling respected`) |
| Flutter analyze | `cd apps/prototype_app && flutter analyze` | **PASS** (`No issues found!`) |
| Flutter tests (full suite) | `cd apps/prototype_app && flutter test` | **PASS** (282 tests, goldens included) |
| Promotion widget test | `flutter test test/cart_promotions_test.dart` | **PASS** (6 tests, incl. removable auto chip) |
| `promotion-acceptance.ts` (live) | requires staging | **NOT RUN** — gated on deploy |
| `promo-code-qc.ts` (live) | requires staging | **NOT RUN** — gated on deploy |

### Pre-existing failures (unchanged, out of scope)

- `services/backend/packages/api/src/scripts/staging-merchandising-test.ts` is **already red at
  `33c6add`**: it asserts legacy codes (`BK-STG-PROMO-*`, `BK-STG-OFFER-ORDER10`) that no longer
  exist after the short-code rename (`6397551`). The path is outside this brief's allowlist
  (`merchandising-*test*.ts` does not match `staging-merchandising-test.ts`) and its reviewed
  fixture is also outside the allowlist. Not changed.
- `merchandising-offer-patterns-test.ts` needs the Medusa container/backend dependencies, which
  are not installed in this worktree; not run.

## Behaviour notes / interpretations

1. **Sticky removal applies to any offer removal** (not only Flat5%). Removing ORDER10 leaves 0%
   and does not restore Flat5%, as R6/R8 require. Applying a manual code also sets the opt-out,
   because the customer chose to replace the store offer.
2. **One code per POST.** A request with multiple codes now returns `400
   invalid-promotion-code` instead of applying them in sequence. The app sends one code; D1 makes
   multi-code requests meaningless. Existing single-code clients are unaffected.
3. **Rejection restores the previous offer.** The API removes the current code, attempts the new
   one, and re-applies the previous code if the engine refuses. The 422 body keeps the existing
   `rejected_codes` shape and adds `restored_codes`.
4. **Defensive 15% guard.** If the engine leaves two offers applied, the API removes both rather
   than return a stacked cart.
5. **Auto-apply runs on the first line**, not on cart creation (an empty cart cannot be
   discounted). Carts that already had lines before the deploy are not retrofitted.

## Deferred register

| Item | Why | Owner / when |
|---|---|---|
| Runtime QC R1–R10 (`qc-output.txt`) | Requires the approved deploy + promotion data script | worker-live after `DEPLOY APPROVED` |
| Cart/checkout screenshots (`screenshots/`) | Require the deployed app against staging | worker-live after deploy |
| Zero console errors at runtime | Requires the app running against staging | worker-live after deploy |
| Formal CHG number | Requester assigns it | control room / requester |
| Production release | Forbidden by the brief | human authorisation only |

## Residual risks

1. **Discount base.** Medusa documents that `target_type: order` distributes across cart items
   (not shipping). QC R6/R10 assert exact 10% of the item subtotal with a shipping method
   attached; if the deployed engine differs, QC fails rather than shipping a wrong amount.
2. **Engine behaviour change.** Flat5% relies on a code promotion plus the API's opt-out, not on
   engine state. If a future release makes FLAT5 automatic again, removal would regress; the QC
   suite is the guard.
3. **Metadata write failure after apply.** The discount still shows, but as a manual code (no
   automatic marker). It remains removable; no false claim is made.
4. **Restore failure after a rejection.** If re-applying the previous code fails, the customer is
   left at 0% rather than a wrong discount; the 422 explains the rejection.
5. **Budget exhaustion.** "Pilot Flat Offers" holds INR 500,000 of spend budget; if exhausted,
   FLAT5 stops applying. QC would show 0% on a new cart.
6. **PLY5 history.** Inactive, not deleted. Existing order adjustments are untouched; an existing
   cart that already carries PLY5 keeps it until recalculation, but it is no longer automatic.
7. **Pre-existing red test** (above) remains red; it does not cover U-003 behaviour.

## Release and rollback

- **Release candidate:** `fd52d6a`
- **Previous release / rollback:** `33c6add`
- **Mechanism:** Experience API image + Flutter app build, plus the idempotent
  `configure-staging-merchandising` data script (run once after approval, before QC).
- **Deploy order (brief):** API healthy → data script → app build → proxy restart → QC.
- **Not authorised by this brief.** Awaiting a recorded deploy gate and the requester's pasted
  approval. Production is untouched.
