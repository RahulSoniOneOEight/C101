# U-001 / B001 — category banner edits must reach the storefront

- **Bundle:** U-001 · B001
- **Lane / release:** B / `image-rebuild` (`buildkart-hosted-pilot-medusa`, `buildkart-hosted-pilot-experience-api`, `buildkart-hosted-pilot-cms`)
- **Base:** `0e64bd3a963f35c6a18c0a55a450e6a56f415d69` — rebased from `d365eba` at the deploy gate (§0)
- **Branch:** `fix/u001-category-banners`
- **Code commit:** `33c6add`
- **Rollback SHA:** `0e64bd3`
- **Worktree:** `C:\Users\LENOVO\AppData\Local\Temp\opencode\bk-u001-category-banners`
- **Environment:** staging only · **production: forbidden, untouched**
- **Deployment:** **not performed.** No docker, no ssh, no push, no staging data write.

## 0. Rebase onto the live staging release (G-002)

At the deploy gate the staging baseline had moved: `/opt/buildkart-releases/current` pointed at
`release-0e64bd3` (commit `0e64bd3`), **8 commits ahead of the approved base `d365eba`**, with
`d365eba` an ancestor. Deploying a `d365eba`-based release would have reverted:

- **CHG-081** — the `web` service in `services/hosted/docker-compose.hosted.yml` and the app-host
  `location /` in `services/hosted/nginx.conf.template`; the mandatory proxy restart would have
  returned **404 for the web storefront**;
- **CHG-080** — the admin guard in `merchandising/bought-together/page.tsx`, inside the Medusa image.

The release was stopped before any host mutation and raised as G-002. The requester approved
**option A**: rebase the bundle onto `0e64bd3`, re-run G5, release the new SHA, roll back to
`0e64bd3`. The rebase was conflict-free (`git merge-tree` exit 0, tree `145e39c`) because the 8
intervening commits touch none of this bundle's files; the bundle content is byte-identical.

`128c11f` (pre-rebase code) → `33c6add` (rebased code); the evidence commit is rebased on top of it.


## 1. Outcome

A published category banner now owns the storefront category copy. Its heading becomes the category
`label` and its subtitle becomes `short_text`, ahead of the category editorial and the governed seed,
for B2C and B2B. Image and alt-text delivery is unchanged, category copy never enters the home banner
list, and the Banner Studio no longer contradicts delivery.

**Decision implemented:** option A — the banner owns the text (requester instruction, 2026-10-27).
Precedence: **banner heading → category editorial label → governed seed → commerce name**, and
**subtitle → editorial `short_text` → seed**.

## 2. Baseline and scope

| Gate | Record |
|---|---|
| G1 baseline | original: branch `fix/u001-category-banners`, HEAD `d365eba`, `git status --porcelain` **empty**; rebased onto `0e64bd3` at the deploy gate (§0) |
| G2 scope | allowed paths from the brief, amended by the G-001 answer to include `services/cms/src/operator-content.ts` |
| Files outside the allowlist | **none** (`git diff --name-only 0e64bd3..33c6add`, §4) |
| Data writes | **none** — R10 is diagnosis only |
| CMS schema / migration | **none** — `banner/schema.json` already declared `imageAltText`; only the operator allowlist changed |
| `apps/prototype_app/**`, `apps/web/**` | untouched — the app already renders `label` and `short_text` |
| `C101-commission-statements` | never opened or touched |

**G-001 (resolved):** the private operator content API rejects any field not listed in
`services/cms/src/operator-content.ts` (`sanitizeData` throws), and CHG-047 had removed
`imageAltText` from that list. Without the allowlist entry, shipping the console field would have
failed *every* banner save. Approval granted 2026-10-27 for the single entry plus the CMS image in
this release; implemented exactly as approved.

## 3. Requirement ledger

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R1 | Published category banner `title` becomes `label`, B2C and B2B | **PASS-CODE** | `presentation-test`: `Construction banner` beats editorial `Construction & Site` (B2C) and `Trade construction banner` beats it on B2B; direct compose check printed below. Live payload after deploy. |
| R2 | Non-empty `subtitle` becomes `short_text`, B2C and B2B | **PASS-CODE** | same test: `Site supplies and bulk cement`, `Trade pricing for site supplies` |
| R3 | Empty banner text falls back editorial → seed → commerce name, never blank | **PASS-CODE** | three explicit cases: empty heading → seed label, empty subtitle → editorial short text, no banner/editorial/seed → commerce name; empty banner keeps the editorial image |
| R4 | Image and alt deliver unchanged; no home hero/campaign regression | **PASS-CODE** | image/alt chain untouched and asserted; home list asserts 2 banners, no alt field, no category titles; `cms-content-test` PASS |
| R5 | List shows the category name on the placement cell; placement label printed once | **PASS-CODE** | `banner-model`/`banner-studio-page`; admin `tsc -b && vite build` clean. Screenshot at deploy gate. |
| R6 | Alt-text field persists to `imageAltText`; preview uses it | **PASS-CODE** | CMS operator handler driven with a fake Strapi: definition projects `imageAltText`, a save returns HTTP 200 and forwards `"Alt"`, round-trip returns `"Alt"`, `themeKey` still rejected 400. Preview maps `image_alt`. Staging save at deploy gate. |
| R7 | Stale copy removed: B2B "reads the CMS" caveat, "Placement / audience" header | **PASS** | source review (the proof the brief specifies): recursive grep for both strings across `services/backend/apps/admin/src` returns no matches |
| R8 | Category preview shows effective text, not a heading delivery ignores | **PASS-CODE** | editor reads the published category editorial and composes with the same precedence; preview states the source and, when nothing resolves, says delivery falls back to seed/name instead of inventing a heading. Admin build clean; screenshot at deploy gate. |
| R9 | Destination/CTA section hidden for category placements, one-line note | **PASS-CODE** | section 03 replaced by the note; the CTA button label is hidden with it (see A-2). Admin build clean. |
| R10 | Data gaps diagnosed with exact record state, no writes | **PASS** | §6, read-only `GET /v1/content/presentation` (b2c and b2b) + source; no credentials, no writes |
| R11 | Experience API tests, typecheck; admin build/typecheck | **PASS** | §5: `presentation-test` PASS, `cms-content-test` PASS, `tsc --noEmit` exit 0, admin `tsc -b && vite build` exit 0 |

No requirement is DEFERRED or BLOCKED. `PASS-CODE` is the maximum available before the human deploy
gate, exactly as the brief instructs for R1/R2/R8.

## 4. Files changed

`git diff --name-only 0e64bd3..33c6add`

```text
services/backend/apps/admin/src/routes/content/banner-studio/banner-editor.tsx
services/backend/apps/admin/src/routes/content/banner-studio/banner-model.ts
services/backend/apps/admin/src/routes/content/banner-studio/banner-preview.tsx
services/backend/apps/admin/src/routes/content/banner-studio/banner-studio-page.tsx
services/cms/src/operator-content.ts
services/experience-api/src/content/cms-adapter.ts
services/experience-api/src/content/presentation.ts
services/experience-api/src/scripts/presentation-test.ts
```

```text
 .../banner-studio/banner-editor.tsx            | 152 +++++++++++++++------
 .../banner-studio/banner-model.ts              |  78 +++++++++++
 .../banner-studio/banner-preview.tsx           |  56 +++++++-
 .../banner-studio/banner-studio-page.tsx       |  41 +++++-
 services/cms/src/operator-content.ts           |   7 +
 services/experience-api/src/content/cms-adapter.ts    |  32 ++++-
 services/experience-api/src/content/presentation.ts   |  19 ++-
 services/experience-api/src/scripts/presentation-test.ts | 143 +++++++++++++-
 8 files changed, 468 insertions(+), 60 deletions(-)
```

### Delivery path

- `cms-adapter.ts` — `CategoryBannerOverride` now carries `title`/`subtitle`; `resolveCategoryBanners`
  maps them (trimmed, empty dropped). `buildBannerPreview` returns `BannerPreviewProjection` and adds
  `image_alt` **to the preview only**, so the home delivery contract does not widen (CHG-047).
- `presentation.ts` — `composeStorefrontCategories` applies banner → editorial → seed → commerce name
  for `label`, and subtitle → editorial → seed for `short_text`. `presentation_source` reports `cms`
  when the copy came from a banner as well as from an editorial.
- `operator-content.ts` — one allowlist entry, `imageAltText` (string), for the existing schema
  attribute.

### Console

- `banner-model.ts` — `imageAltText` on the form (read + serialize); `effectiveCategoryCopy` and
  `categoryEditorialCopy` model the delivery precedence for the preview, restricted to published
  editorial records (drafts are never delivered).
- `banner-editor.tsx` — alt-text field; category copy query; preview receives the effective copy;
  CTA section replaced by a one-line note for category placements; stale B2B caveat removed.
- `banner-preview.tsx` — renders the effective category text with its provenance, shows the alt text
  for category placements, and never prints a heading delivery would ignore.
- `banner-studio-page.tsx` — placement cell resolves the commerce category name, prints the placement
  label once, and the header is `Placement`.

## 5. Verification output

```text
$ cd services/experience-api && bun run src/scripts/presentation-test.ts
presentation-test: PASS (banners and category presentation delivered from backend, CMS overrides seed, fallback preserved, no transactional leakage)

$ bun run src/scripts/cms-content-test.ts
cms-content-test: PASS (published mapping, references, cache, last-valid, confirmed absence, seed fallback, HMAC verification)

$ bun run typecheck          # bunx tsc --noEmit
exit=0

$ cd services/backend/apps/admin && bun run build    # tsc -b && vite build
✓ built in 36.38s
exit=0
```

Re-run after the rebase onto `0e64bd3`: identical results — `presentation-test` PASS,
`cms-content-test` PASS, experience-api `tsc --noEmit` exit 0, admin build exit 0 (26.47s on the
rebased tree).

Direct precedence probe (same modules, no mocks):

```text
{"category_id":"p1","name":"Construction","label":"Banner Heading","short_text":"Banner Sub","icon_key":"category","presentation_source":"cms"}
{"category_id":"p2","name":"Construction","label":"Construction","icon_key":"category","presentation_source":"governed-editorial-seed"}
```

CMS operator allowlist, driven through the real handlers (`registerCmsOperatorRoutes`) with a fake
Strapi — this is the boundary that made G-001 necessary:

```text
definition: contentKey,name,categoryId,placement,title,subtitle,ctaLabel,ctaTargetType,ctaTargetId,externalImageUrl,imageAltText,startsAt,endsAt,timezone,priority,segments
imageAltText: {"name":"imageAltText","label":"Image alternative text","type":"string","description":"..."}
save status: 200
persisted: {"contentKey":"k","placement":"b2c.category.banner","title":"H","imageAltText":"Alt"}
returned imageAltText: "Alt"
rejected themeKey: 400 Field 'themeKey' is not editable for banner.
```

Dependencies were absent in the worktree; `bun install --frozen-lockfile` was run in
`services/experience-api` and `services/backend` to execute these checks (and again after the local
`node_modules` trees were emptied by an external cleaner between runs). Nothing lock- or
manifest-related changed.

## 6. R10 — data gaps, diagnosed (read-only)

Source: `GET https://api-staging.pinakaplay.cloud/v1/content/presentation?channel=b2c|b2b&locale=en-IN`,
observed `2026-10-27T10:40:22Z`, `source=cms-strapi+category:cms-strapi`, `stale:false`. Comparison
against `categoryPresentationSeed` in `services/experience-api/src/content/presentation.ts`.

| Category | Channel | label | short_text | image | alt | `presentation_source` |
|---|---|---|---|---|---|---|
| Tools & Hardware<br>`pcat_01M57QZFXG5E8KD9P8K7Q6G89S` | b2c | Tools & Hardware | Drills, fasteners and hand tools | **null** | null | cms |
| | b2b | same | same | `…/banners/01-tools-hardware.jpg` | null | cms |
| Pumps & Machines<br>`pcat_01M4EC9BNM9X603HVQBQ93J969` | b2c / b2b | Pumps & Machines *(= seed)* | Water pumps, generators and machinery *(= seed)* | Pexels `175709` *(= seed)* | **authored** | cms |
| Building & Constructions<br>`pcat_01M4EC9BNG9AVFBH8RAN8MDP0V` | b2c / b2b | **Building & Construction** *(authored)* | Cement, steel, tools and site supplies *(= seed)* | Pexels `1216589` *(= seed)* | **authored** | cms |

Seed reference: Pumps `label "Pumps & Machines"`, `short_text "Water pumps, generators and machinery"`,
image Pexels `175709`; Building `label "Construction"`, `short_text "Cement, steel, tools and site supplies"`,
image Pexels `1216589`; **no seed row exists for Tools & Hardware**.

Exact record state:

1. **Tools & Hardware (B2C) — no image.** The editorial record exists (source `cms`, label and
   short text authored) but contributes no image, and no B2C category banner supplies one. B2B
   delivers `01-tools-hardware.jpg`, so the gap is **channel-specific**: the B2C category banner
   image is absent, unpublished, or outside its window. Alt text is null in both channels.
2. **Pumps & Machines — seed fallback in effect.** Label, short text and image are byte-identical to
   the seed; only alt text is authored. The record therefore contributes alt text (or duplicates the
   seed values) and the storefront is driven by the seed.
3. **Building & Constructions — partial authoring.** The label is authored (it is neither the seed's
   `Construction` nor the commerce name `Building & Constructions`) and alt text is authored, while
   short text and image are byte-identical to the seed.
4. `Miscellaneous` is the only category with no editorial record at all
   (`governed-editorial-seed`), which is why it has no image and no short text.

**Limit of the evidence, stated plainly:** where a value equals the seed exactly, the public payload
cannot prove whether the record field is blank or repeats the seed. Confirming that needs the three
records above by category id and channel in the CMS. **No data was written and no CMS credential was
used.** R10 requires diagnosis only; any content fix is a separate, operator-owned data change.

## 7. Deploy-gate items (not deferred requirements)

These are the runtime steps the brief assigns to the human gate; they are recorded so nothing is
silently dropped.

| Item | Owner | Why it cannot be done here |
|---|---|---|
| `GET /v1/content/presentation?channel=b2c|b2b` shows an edited heading as `label` and the subtitle as `short_text` (R1, R2, R3 at runtime) | deploy gate | requires the release |
| Save a banner with alt text in the staged console and confirm `imageAltText` on the record (R6 at runtime) | deploy gate | requires the rebuilt CMS + admin bundle |
| Screenshots: list with category names (R5), category preview (R8), hidden destination section (R9) | deploy gate | requires the deployed console and a session |
| Category tile on `buildkart-staging.web.app` | deploy gate | requires the app against the released API |
| Confirm the publish-invalidation webhook after deploy (brief dependency: "webhook secret unverified") | deploy gate | secret is not available here |

## 8. Pre-existing red checks (not caused by this bundle)

Both are red at `d365eba` and neither file is in this diff.

1. `python tooling/validate_cms_schemas.py` → fails with
   `curated-collection/schema.json:displayOrder`. The validator's forbidden-token list matches
   `order` inside `displayOrder`; `curated-collection/schema.json` is untouched by this bundle
   (`git diff --name-only` above). Pre-existing false positive.
2. `bun run src/scripts/storefront-layout-test.ts` → fails at line 19
   (`assert.equal(resolveLayout("b2b", "en-IN"), undefined)`). `git show d365eba:…/storefront-layout.ts`
   already contains a `b2b-home` seed layout, so the assertion was already false at the base commit.
   Pre-existing stale assertion; `storefront-layout.ts` is untouched here.

Neither is part of R11's stated set (experience API presentation tests, typecheck, admin build), and
both were left alone deliberately: fixing an unrelated validator and an unrelated stale test would
widen the bundle.

## 9. Assumptions and decisions

- **A-1 — test file naming.** The scope lock allows `services/experience-api/src/**/*.test.ts`; the
  repository's presentation test is `src/scripts/presentation-test.ts` (`bun run test:presentation`).
  It is the only test covering the composer, so it is treated as the in-scope test file.
- **A-2 — "Button label" hidden with section 03.** R9 hides the destination section for category
  placements. The button label is a CTA field and would have contradicted the note, so it is hidden
  under the same condition. This is the smallest consistent change; the field and its value are not
  deleted from existing records.
- **A-3 — `presentation_source`.** A banner-authored heading makes the category `cms`, not
  `governed-editorial-seed`. Reporting the seed while the copy came from a banner would misstate the
  source; no consumer branches on this value beyond display.
- **A-4 — alt text scope.** The field is available on every banner, but the preview surfaces it only
  for category placements, the only surface where alt text is delivered (CHG-047 removed it from the
  home banner contract). The field's help text says exactly that.
- **A-5 — CHG record.** `CHG-087` is not drafted: `client-projects/client101/changes/` is outside the
  scope lock. The identifier is used only as a traceability tag in comments; the control room owns
  the governance record.
- **A-6 — preview precedence for the console.** The console cannot read the governed seed, so for a
  category placement with no banner heading and no published editorial it states that delivery falls
  back to the seed and then the category name, rather than inventing a heading. The preview never
  claims more than it can prove.

## 10. Residual risks

1. **Runtime unverified.** R1–R6, R8, R9 are `PASS-CODE`. The first real proof is the deploy-gate
   payload and screenshots.
2. **Banner heading now always wins.** Because the CMS requires `title`, a category banner will
   normally override the editorial label. That is the intended option-A behaviour, but operators must
   be told: to show the Category details label, keep the heading equal to it or do not create a
   banner. The editor note states the override in one line; no further guard was added.
3. **Duplicate category banners.** If two published category banners target the same category and
   channel, the last one read wins (existing behaviour for image/alt, now also for text). No
   uniqueness constraint exists and none was added (schema is out of scope).
4. **Console precedence duplicates delivery logic.** `effectiveCategoryCopy` mirrors
   `composeStorefrontCategories` in the admin bundle, which cannot import the service. The two are
   documented together; a future change to the precedence must update both. There is no test harness
   in the admin app, so this function is covered by compile + review only.
5. **Seed opacity in the preview.** As in A-6, the preview cannot show a seed label. If an operator
   clears a heading on a category with a seed and no editorial, the preview shows a note rather than
   the exact seed string.
6. **Two pre-existing red checks** (§8) remain red; they are unrelated but will show up in any
   "run everything" pass.

## 11. Release

- **Build from:** `33c6add` (code, rebased onto `0e64bd3`). Evidence commit `d4b8990` follows on the
  same branch.
- **Mechanism:** `image-rebuild` — this bundle contains a CMS change, so `buildkart-hosted-pilot-cms`
  must be rebuilt and recreated with the API and console. The content database is untouched.
- **Previous release / rollback:** `0e64bd3` (`/opt/buildkart-releases/release-0e64bd3`).
- **Scoped release check (G5) before deploy:** `git log --oneline 0e64bd3..33c6add` → one commit;
  `git diff --name-only 0e64bd3..HEAD` → this bundle's 8 files plus this closeout. Nothing else.
- **Production:** not authorized, not touched.
