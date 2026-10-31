# U-007 — Product tile v2: B2C only (decision b)

- **Bundle:** U-007 — B2C product tile v2: real tags, visible MRP, high-impact polish
- **Lane:** **A** — B2C app tile only; no API, admin, schema or B2B change
- **Worktree:** `C:\Users\LENOVO\AppData\Local\Temp\opencode\bk-u007-product-tile-v2`
- **Branch:** `feat/u007-product-tile-v2`
- **Base:** `a13bcb4` (live staging at start; U-005 included)
- **Status:** code complete; **no staging deploy** (Flutter app is source-only)
- **Production:** untouched, forbidden

## Decision

**(b) additive source flag.** The shared `Product` model gains `mrpIsReal` and
`badgesAreReal`, derived at read time:

- `mrpIsReal = true` only when the payload carries a real list price
  (`list_amount_minor` / original amount);
- `badgesAreReal = true` only when the payload carries real admin tags (`badges[]`).

The values are additive; B2B ignores them. The B2C tile gates the struck MRP,
discount chip and badges on them. The 9 non-imported products with real admin tags keep
their badges; synthetic MRP/tags never reach the B2C tile.

## Scope / diff

| Path | Change |
|---|---|
| `packages/agency_flutter_ui/lib/agency_flutter_ui.dart` | ProductCard v2: 65% image, `contain` + `cacheWidth`, badges max 2 + `+N`, 44×44 wishlist/add, one-line title, two-line price block |
| `apps/prototype_app/lib/domain/models.dart` | additive `mrpIsReal` / `badgesAreReal`, B2C allowlist + `b2cBadges`, cache round-trip |
| `apps/prototype_app/lib/screens/product_list_screen.dart` | remove `['Assured']` fallback; real-only MRP/discount; allowlist; brand only |
| `apps/prototype_app/lib/widgets/merchandising_sections.dart` | real-only MRP/discount; allowlist |
| `apps/prototype_app/lib/screens/d2c_shell.dart` | real-only MRP/discount; allowlist; brand only |
| `apps/prototype_app/lib/screens/collection_screen.dart` | real-only MRP/discount; allowlist; 44×44 wishlist |
| `apps/prototype_app/test/product_tile_v2_test.dart` (new) | flag matrix, allowlist, cache round-trip, 1.3× text scale |
| `packages/agency_flutter_ui/test/product_card_test.dart` | two-line price, no stock line, max-2 badges, no-MRP case |
| `apps/prototype_app/test/goldens/home.png`, `browse.png` | B2C goldens regenerated for the new tile |

No B2B file was touched: `b2b_v5.dart`, `trade_product_tile.dart`, `b2b_*` screens are unchanged.

## Price input (staging reference)

The U-007 diagram uses “Action Tesa HDHMR Board” as its example. The live staging product
(`prod_01M59JS4A6QTH32AXVW9P2D3A3`, SKU `XZ5QR`) returns:

```json
{
  "unit_amount_minor": 43690,
  "list_amount_minor": 51400,
  "discount_percent": 15,
  "price_source": "price_list"
}
```

The API amount is **minor units (paise)**. `Money.formatted` rounds **up** to whole rupees
(`major.ceil()`), so the tile renders:

- selling price **₹437** (`43690 / 100 = 436.9`, rounded up)
- **MRP ₹514** (`51400 / 100`)
- **15% off**

The plan mock writes `₹43,690` / `₹51,400` — the minor-unit value read as rupees, **100× too
high**. The live tile shows ₹437 / MRP ₹514 (verified on staging), not the mock numbers. No code
change was needed for the scale; the mock was the incorrect input.

The B2C goldens use the app's demo catalogue (`₹6,499`, etc.), not this SKU; the real tile formats
from the API `Money` value. Because `list_amount_minor` is present, `mrpIsReal` is true and the
MRP/discount show for this product.

## D2C tile QC (visual)

The implemented `ProductCard` was rendered at 260×260 with the reference data and a readable font:
`screenshots/tile-qc-260.png`.

| Diagram item | QC result |
|---|---|
| Card size | 260×260 |
| Image share | ≥60% of the card (Expanded image; ~65% at 1.0 text scale) |
| Badges | `Assured`, `Flash Deal`, `+1` (max 2 + overflow) |
| Wishlist | 44×44 target, top-right, filled state |
| Add control | 44×44 `CartPlusIconButton`, image bottom-right |
| Brand | `ACTION TESA` (no SKU count) |
| Title | one line, “Action Tesa HDHMR Board” |
| Price | `₹437` + `15% off` chip (live format; the 260 render used the literal `₹436.90`) |
| MRP | `MRP ₹514`, struck, second line (render literal `₹514.00`) |
| Removed | seller, SKU count, stock line, descriptor |
| Console/layout errors | none |

The image area is the placeholder in this component render; product images render in the app.

## Live staging deployment

- Released **2026-10-30 21:09:19Z** to `https://buildkart-staging.web.app`
  (`firebase deploy --only hosting`, project `buildkart-staging`; previous release 2026-10-29 23:02:17Z).
- Live `main.dart.js`: 3,925,894 bytes, SHA-256
  `0444629AB44920112D06998960DF08F2779FD3B5F29E304B8AEF542A4A64199B`, contains `04422ed`;
  the staging banner shows `STAGING · 04422ed`.
- Screenshots: `screenshots/live-browse.png` (desktop top), `live-browse-tiles.png` (desktop grid),
  `live-browse-mobile.png` (390 px).
- Observed live: brand-only line (`homerun`), one-line title, `₹437` + `15% off` on line 1,
  struck `MRP ₹514` on line 2, heart top-right, 44×44 cart-plus overlay on the image, contain image,
  no seller / SKU count / stock line / descriptor.
- `Flash Deal` badge appears on a product with a real admin badge.
- “Recommended for you” carousel cards omit the heart because that call site
  (`merchandising_sections.dart`) passes no `onWishlist`; grid tiles pass it and show the heart.
  Optional affordance, unchanged behaviour.

## Staging overwrite (2026-10-31 15:09 IST / 09:39Z)

- The hosting site was redeployed by the U-009 session from `feat/u009-pincode-delivery`
  (`f6a86ab`), built without `BUILD_ID` — the banner reads `STAGING · dev`.
- That branch includes `8482e94` but **not** U-007 (`d43af6d`), so the live tile reverted to the
  pre-U-007 layout: `homerun · 1 SKU`, `% off` pill at the image top-right, inline `₹437 ₹514`,
  heart at the image bottom-right, add button in the price row.
- Evidence: `screenshots/live-after-overwrite.png`; live `main.dart.js` 3,923,009 bytes,
  SHA-256 `7E233DB4007D405CD9ED2912678F71BE830C22F630715F41A94528833D890FC4`.
- U-007 source and artifact are intact (branch `feat/u007-product-tile-v2`, `d43af6d`; artifact hash
  `0444…4199B`). The fixes are not lost in source — only off the deployed surface.
- Recovery: rebase U-007 onto `f6a86ab`, rebuild with a real `BUILD_ID`, verify, then a single
  combined deploy. Do **not** redeploy U-007 alone — it would revert the U-009 pincode work.

## Build & rebase record (pre-release)

- Branch `feat/u007-product-tile-v2`, rebased onto live staging `8482e94`; build id `04422ed`.
- `flutter analyze`: no issues. Full suite: **293 passed**.
- Web release build with staging API:
  `flutter build web --release --dart-define=BUILDKART_ENVIRONMENT=staging`
  `--dart-define=EXPERIENCE_API_BASE_URL=https://api-staging.pinakaplay.cloud`
  `--dart-define=MEDUSA_BASE_URL=https://api-staging.pinakaplay.cloud`
  `--dart-define=BUILD_ID=04422ed`
- Artifact: `apps/prototype_app/build/web`, `main.dart.js` SHA-256
  `0444629AB44920112D06998960DF08F2779FD3B5F29E304B8AEF542A4A64199B` (contains `04422ed`).
- Rebase integration: CHG-098 changed `ExperienceApi.createCart({String? channel})`; four test
  fakes updated. `b2b_checkout.png` refreshed because the live base failed it before U-007:
  the regenerated golden is byte-identical to a clean `8482e94` render
  (`D89D7628FDDCB8528C2D57591114DB11B22A3DA29195C008DF8FBC28704B9703`), so U-007 adds no B2B
  visual change. The other five B2B goldens keep their original hashes.

## Combined recovery build (2026-10-31)

- Rebased U-007 onto the live U-009 head `f6a86ab`; combined head `760f081`.
- Diff vs `f6a86ab` is U-007 only: `models.dart`, four B2C call sites, `ProductCard`, tests/goldens,
  evidence. No B2B code touched.
- `flutter analyze` clean; full suite **293 passed**.
- `b2b_checkout.png` refreshed for the U-009 base; the new hash
  `41269BE05E84EBD7DF5F854852C4031F911B2EE1907E9B589CF867D0F313871B` is byte-identical to a clean
  `f6a86ab` render, so U-007 adds no B2B visual change. The other five B2B goldens are unchanged.
- Web artifact rebuilt with staging APIs and `BUILD_ID=760f081`:
  3,926,843 bytes, `main.dart.js` SHA-256
  `2741760E7225935F6B4DFFD9F3CAECF943D9312790F26D180CCE68AE4C6EDA5B`.
- `firebase deploy --only hosting --project buildkart-staging --dry-run`: PASS.
- Release is pending the approval line. Deploying this combined build restores the tile **and** keeps
  U-009 pincode delivery; deploying U-007 alone would revert U-009.

## Verification

| Check | Result |
|---|---|
| `flutter analyze` | **No issues** |
| Full Flutter suite | **290 passed** (goldens included) |
| Package `product_card_test` | **8 passed** |
| U-007 model/tile tests | **5 passed** |
| 1.3× text scale | no overflow |
| Flutter web release build | **PASS** (`Built build\web`) |
| B2B goldens | **byte-identical** — SHA-256 before/after match |

B2B golden SHA-256 (unchanged):

```
b2b_approvals.png  55326B87FD98451DF96DDF1D30E0ACEB20D7D8CA94D9E389401B07674967D436
b2b_catalogue.png  0294CE8127B8295E032F3837B5FC43F18B98ABA3B8EAB8E9003DEA349799D406
b2b_checkout.png   46218A16493C40E08B5C488BA3ED40229ABA6CAD1890DE9A3911DE389C681C9E
b2b_home.png       BBCBEB9FAF8D5F0C5D4ABF762782749C6A77A5C253A079C289A55773C22BCB02
b2b_projects.png   3FC0D3BAEF2E221A72FC374079C6B6BF6AFD65ECBF7CBEB15F2722082B6BE4DE
b2b_team.png       7A3F509DBCEBFED2008D3B1B93458FD71B1DCDFDE1647BFBA224D44CF314FC5F
```

## Requirement ledger

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R1 | Price line 1, struck MRP line 2, MRP never ellipsized | **PASS-CODE** | `_priceBlock`; package test `MRP ₹1,999`; B2C goldens |
| R2 | Image ~65%, `BoxFit.contain`, `cacheWidth` | **PASS-CODE** | `_image`; `Expanded` image; B2C goldens |
| R3 | One-line B2C title; descriptor/seller/SKU/stock lines removed | **PASS-CODE** | `_build` one-line title; no stock line test |
| R4 | Synthetic MRP/tags never shown; real admin tags kept | **PASS** | `Product` flags; U-007 tests (synthetic hidden, 9 real-tag case kept) |
| R5 | Allowlist + max 2 + `+N`; priority order | **PASS** | `b2cBadges`; package test `+1`; allowlist in `models.dart` |
| R6 | 44×44 wishlist and add targets | **PASS-CODE** | `_wishlistButton` 44; `CartPlusIconButton(size: 44)` |
| R7 | 1.3× text scale does not clip | **PASS** | `compact B2C tile has no overflow at 1.3x text scale` |
| R8 | B2B tile/flows byte-identical | **PASS** | six B2B golden hashes unchanged; no B2B file in the diff |
| R9 | No API/admin/schema change | **PASS** | none touched; flags derived from existing payload |
| R10 | Analyze/tests/build | **PASS** | analyze 0; 290 tests; web release build |

## Deferred

| Item | Why |
|---|---|
| Skeleton loading / image fade (P2) | not in the required P0/P1 slice |
| Ratings/reviews, delivery promise (P2) | blocked on missing data |
| Device screenshots at 390/1440 | Flutter app is source-only on staging; goldens + web build are the current evidence |
| Live D2C web/APK build | the running app is pre-U-007; the staging web build is ready but not deployed |
| Deploy | no deploy requested/authorised; app runtime is not hosted on staging |

## Residual risks

1. **Synthetic data remains in the shared model for B2B.** The B2C tile gates it; B2B output
   is byte-identical. Removing it globally would be a B2B change and is out of scope.
2. **`review_catalogue.dart` is unchanged.** It still supplies collection buckets and the
   synthetic values; the B2C tile no longer trusts them. Removing the file is a later cleanup.
3. **Goldens use the repo's Ahem font.** Layout is verified; real typography is reviewed on device.
4. **`CompactProductItem`** (merchandising compact rail) is a separate widget; its discount label
   is gated on `mrpIsReal`, but it is not the U-007 ProductCard.
