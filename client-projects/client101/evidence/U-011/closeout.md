# U-011 / B005 — Browse layout closeout

- **Brief:** `D:\C101-control-room\briefs\B005-browse-spacing.md`
- **Lane / release:** A / `static-ui` (Flutter web) + APK artifact — **no image rebuild, no API change**
- **Base:** `3d2bdff` (staging release, host-verified 2026-10-31T19:34Z)
- **Branch / worktree:** `feat/u011-browse-spacing` @ `D:\C101-worktrees\bk-u011-browse-spacing`
- **Status:** implemented and verified locally. **Deploy not run** — the brief reserves it for the human gate.
- **Scope:** B2C only. No B2B file, no `services/**`, no `apps/web/**`, no data record touched.

## 1. Release-line warning (read before deploying)

Live staging is **`9003721`**, which contains `7cc48c5` + `9003721` (B2B chat parity, shipped after
`3d2bdff`). This branch is based on `3d2bdff` as the brief requires, so **building the release from
this branch head alone would revert the chat parity**.

Deploy procedure (for the release owner):

```sh
# bring U-011 onto the live release line first
git checkout feat/u009-pincode-delivery          # or the current staging release line
git merge --no-ff feat/u011-browse-spacing        # conflict-free: no shared files
python tooling/check_staging_release_line.py --require-clean
python tooling/build_staging_web.py --build-id <merge-sha> --require-clean
firebase deploy --only hosting --project buildkart-staging
```

`7cc48c5`/`9003721` and the U-011 commits touch disjoint files (`services/workspace`,
`conversation_dock.dart` vs `d2c_shell`, `product_list_screen`, `agency_flutter_ui`), so the merge is
clean. The U-011 diff itself stays B2C-only.

## 2. What changed

| File | Requirement | Change |
|---|---|---|
| `apps/prototype_app/lib/screens/d2c_shell.dart` | P0-1 | Browse grid `mainAxisExtent: 296` → `childAspectRatio: 0.64` |
| | P0-3 | `_recommendedStrip` deleted (call + 49-line builder) from Browse; Home modules untouched |
| | P0-4 | Control bar `SliverPersistentHeader(pinned: true)` → `false` (Browse call site only) |
| | P1-1 | Banner bottom `0` → `8`; category rail vertical `4` → `8`; grid top stays `16` |
| | P2-1 | Category rail gets `itemWidth: 64` / `gap: 8` at ≤390 px (`LayoutBuilder`); Home keeps 72/16 |
| `apps/prototype_app/lib/screens/product_list_screen.dart` | P1-2 | Home product grid `mainAxisExtent: 296` → `childAspectRatio: 0.64` |
| `packages/agency_flutter_ui/lib/agency_flutter_ui.dart` | P0-2 | `ProductCard` fills a bounded cell; `320`/`260` fallback only when the parent is unbounded |
| | P1-2 | `ProductGrid` / `ProductCompositionSection` default to `childAspectRatio: 0.64` (fixed extent still available) |
| | P1-2 | `ProductCarousel` derives its height from `itemWidth / 0.64` (Home rails) |
| | P2-1 | `CategoryIconItem.width`, `CategoryIconRail.itemWidth` + `gap` (defaults 72 / 16 unchanged) |
| `apps/prototype_app/test/**`, `packages/agency_flutter_ui/test/product_card_test.dart` | R9/R10 | Geometry harness, parity tests, `browse` golden refresh, 360/390/414 captures |

No change was needed in `storefront_control_bar.dart`: the delegate is untouched and B2B keeps its
pinned usage.

## 3. Requirement ledger

| ID | Requirement | Status | Proof |
|---|---|---|---|
| R1 | Browse tiles ~0.64 at 360/390/414 (160×250, 175×273, 187×292 ±2) | **PASS** | `browse_layout_u011_test.dart` asserts 0.62–0.66 and height = width/0.64 ±2: 160.0×250.0 / 175.0×273.4 / 187.0×292.2 |
| R2 | `ProductCard` fills the cell, fallback 320/260 only when unconstrained, no overflow | **PASS** | Package tests: tight 175×273 cell → 175×273; unbounded compact → 260; unbounded large → 320; plus the existing 1.3× text-scale test |
| R3 | “Recommended for you” absent from Browse, Home modules intact | **PASS** | Harness `find.text('Recommended for you') findsNothing`; Home golden unchanged; real-browser screenshot |
| R4 | B2C Browse bar scrolls away; B2B unchanged | **PASS** | `browse_controls_test` asserts first header pinned / second not; `git diff` has no B2B or control-bar file |
| R5 | Banner → rail → grid = 8 / 8 / 16, no 4 px gaps | **PASS** | Measured: banner bottom → rail top 16.0 (8+8); rail bottom → bar 8.0; bar bottom → grid 16.0 |
| R6 | Other B2C grids at 0.64; B2B tiles/goldens byte-identical | **PASS** | Home grid 0.640 (163×254.7 / 178×278.1 / 190×296.9); Home rails 152/0.64; **only `browse.png` changed among all goldens** |
| R7 | Browse rail 64 px at ≤390, Home 72 | **PASS** | Harness asserts item width + gap (64/8 at 360 & 390, 72/16 at 414 and on Home) |
| R8 | Page padding 16 / gutter 8 unchanged | **PASS-CODE** | Grid padding `EdgeInsets.all(AgencySpacing.md)`, spacing `AgencySpacing.sm`; measured tile x=16 and width (360−32−8)/2 |
| R9 | Screenshots at 360/390/414, Home grid, B2B comparison | **PASS** | `screenshots/` (golden + real browser), B2B real capture, golden diff |
| R10 | `flutter analyze` clean, `flutter test` passes, 0 console errors | **PASS** | App analyze clean + 305/305; package analyze clean + 57 pass (1 pre-existing failure, see §7); local release build: 0 console, 0 page, 0 HTTP≥400 errors |

## 4. Measurements

### 4.1 Widget harness (exact, `browse_layout_u011_test.dart`)

| Width | Tile | Aspect | First tile top | banner→rail | rail→bar | bar→grid |
|---|---|---|---|---|---|---|
| 360 | 160.0 × 250.0 | 0.640 | 515.1 | 16.0 | 8.0 | 16.0 |
| 390 | 175.0 × 273.4 | 0.640 | 528.7 | 16.0 | 8.0 | 16.0 |
| 414 | 187.0 × 292.2 | 0.640 | 539.6 | 16.0 | 8.0 | 16.0 |

Home grid: 163×254.7 (360), 178×278.1 (390), 190×296.9 (414) — all 0.640.
Home rail: item 72, gap 16; Browse rail: 64/8 at 360 and 390, 72/16 at 414.

### 4.2 Real browser, production bundle, 390×844

Same probe on the live base (`9003721`) and on the local U-011 build:

| Node | Live base | U-011 | Δ |
|---|---|---|---|
| Banner subtitle y | 213 | 213 | 0 |
| First grid tile y | **813** | **545** | **−268** |
| “Recommended for you” | present | absent | removed |
| Category item width | 72 | 64 | −8 |
| Grid tile width | 175 | 175 | 0 |

The brief quotes ~757 for the live baseline, which is the offset inside the scroll viewport
(813 − 56 px app bar). In the same frame U-011 measures **489 < 500**, and the first-tile position
moved by **−268 px** (duplicate strip ≈288 px removed, +16 px of P1-1 rhythm, +4 px rounding).

## 5. B2B byte-identical proof

```
$ git diff --name-only
apps/prototype_app/lib/screens/d2c_shell.dart
apps/prototype_app/lib/screens/product_list_screen.dart
apps/prototype_app/test/browse_controls_test.dart
apps/prototype_app/test/goldens/browse.png
packages/agency_flutter_ui/lib/agency_flutter_ui.dart
packages/agency_flutter_ui/test/product_card_test.dart
```

- No `b2b_*`, `trade_product_tile.dart`, `b2b_v5.dart`, `services/**` or `apps/web/**` path.
- All `b2b_home`, `b2b_catalogue`, `b2b_checkout`, `b2b_approvals`, `b2b_team_roles`, `b2b_projects`
  goldens are untouched by the golden refresh (byte-identical blobs).
- B2B home renders unchanged in the real browser (`screenshots/real_b2b_home_390.png`).

## 6. Verification commands

```sh
cd apps/prototype_app && flutter analyze && flutter test        # 305 passed
cd packages/agency_flutter_ui && flutter analyze && flutter test # 57 passed, 27 skipped, 1 pre-existing failure
flutter test test/browse_layout_u011_test.dart                  # geometry + rhythm assertions
flutter test test/u011_capture_test.dart --update-goldens       # 360/390/414 + Home captures
```

Real-browser run: local release bundle served on `127.0.0.1:8099` with the staging defines,
Chromium at 360/390/414, login → Browse (scrolled) → Home (scrolled):
`CONSOLE_ERRORS []`.

## 7. Deferred register

| ID | Item | Reason | Owner |
|---|---|---|---|
| D1 | `firebase deploy` + live console/geometry re-check | brief: deploy not authorised | release owner |
| D2 | Signed APK rebuild for U-011 | Lane A artifact is built only at the deploy gate (needs the protected keystore) | release owner |
| D3 | `packages/agency_flutter_ui/test/b2b_v5_test.dart` “TradeProductCardCompact renders tiers and price” | **pre-existing** failure on `3d2bdff` (proved by stashing the U-011 diff and re-running); the widget renders stepper *or* plus, the test expects both | B2B owner — not U-011 |

## 8. Rollback

- Web: `firebase hosting:rollback --project buildkart-staging`, or rebuild/deploy `3d2bdff`
  (after the chat-parity merge the rollback target is `9003721`).
- Code: discard `feat/u011-browse-spacing`; no migration, no data write, no image.
- APK: previous artifact `app-release-9003721.apk`.

## 9. Residual risks

1. **390 headroom is 11 px** (489 vs 500). The optional B2C-only 80 px control bar would add 22 px of
   margin; it was not applied because the brief marks it optional.
2. Category labels at 64 px wrap to two lines (“Bathroom & Plumbing”, “Agriculture & Seeds”) — checked
   at 360 and 390; no truncation, 56 px circles and the 96 px rail height are unchanged (P2-2).
3. At 414 the rail keeps 72 px items, so the fifth item is edge-clipped (brief allows 64 only at ≤390).
4. Browser semantics rectangles are clipped at the viewport, so exact tile heights are quoted from the
   widget harness; the browser is used for position, screenshots and console health.
5. Home rails changed height (252 → 237.5) as part of P1-2; the 390×844 Home golden did not change
   because the rails sit below the fold with the fixture data — the tall capture shows them.
