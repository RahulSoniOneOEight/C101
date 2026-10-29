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
| Deploy | no deploy requested/authorised; app runtime is not hosted on staging |

## Residual risks

1. **Synthetic data remains in the shared model for B2B.** The B2C tile gates it; B2B output
   is byte-identical. Removing it globally would be a B2B change and is out of scope.
2. **`review_catalogue.dart` is unchanged.** It still supplies collection buckets and the
   synthetic values; the B2C tile no longer trusts them. Removing the file is a later cleanup.
3. **Goldens use the repo's Ahem font.** Layout is verified; real typography is reviewed on device.
4. **`CompactProductItem`** (merchandising compact rail) is a separate widget; its discount label
   is gated on `mrpIsReal`, but it is not the U-007 ProductCard.
