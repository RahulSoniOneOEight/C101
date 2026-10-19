# CHG-060 — category priority and image display-fitness order

**Date:** 2026-10-19
**Status:** Implemented and unit-verified; staging deployment pending
**Change:** `client-projects/client101/changes/CHG-060.yaml`

## Requested

1. Lighting & Electrical first.
2. Bathroom & Plumbing second.
3. Paints & Finishes third.
4. Products with better images first in listings.

The requested third label was confirmed against the live taxonomy as
**Paints & Finishes** (`pcat_01M57QZG8NS654FG2PR3HJ95PW`), not "Painted".

## Category priority

`services/experience-api/src/content/presentation.ts` adds
`storefrontCategoryPriority` and `prioritizeStorefrontCategories`. The function
moves only the three approved names to the front and preserves the relative
order of everything else, so the remaining live order stays:

`Agriculture & Seeds → Pumps & Machines → Building & Construction →
Tiles & Building Materials → Tools & Hardware → Automotive & Tyres →
Miscellaneous`

Matching normalises case, whitespace and `and`→`&`, and checks both the
commerce `name` and the editorial `label`. Both channels read the same composed
category list, so B2C and B2B get the same order. Client-side fallbacks
(`fallbackCategories`, `tradeDashboardProvider`) were aligned to the same order
and labels so an offline rail cannot contradict the live one.

No catalogue identity changed. Commerce still owns product and category ids.

## Image display-fitness order

All 233 CHG-049 thumbnails were downloaded and scored. The score is a
deterministic staging fixture for **card display fitness**, not a judgement of
product quality:

| Factor | Weight |
|---|---|
| Minimum dimension (÷800 px, capped) | 0.32 |
| Pixel area (÷1 MP, capped) | 0.13 |
| Square-card aspect fit | 0.16 |
| Non-white subject coverage | 0.13 |
| Luminance tonal range (std-dev ÷64) | 0.10 |
| Edge sharpness | 0.08 |
| Source-URL provenance | 0.08 |

Evidence: `image-quality-233.json` (all 233 records, scores 20–97, 161 with a
source URL). Generated fixture:
`services/experience-api/src/catalogue/image-quality-scores.generated.ts`.
Reproduce with `tools/score-images.py`.

`orderByImageQuality` sorts the **whole matched catalogue** before slicing, so
pagination stays globally ordered rather than re-ordering each page. Ties and
unknown products keep their original relative order. `ProductSummary` and
`ComposedProduct` now expose `image_quality_score` and
`image_quality_fixture: "CHG-060"`.

Explicit shopper sorts still win: B2C price/rating sorts and B2B
price/discount sorts re-sort the already quality-ordered list; `relevance` and
`recommended` keep the API order.

### Highest and lowest scoring

| Score | Dimensions | Category | Product |
|---|---|---|---|
| 97 | 1254×1254 | Tiles & Building Materials | Action Tesa HDHMR Board, 8' × 4' |
| 94 | 2000×2000 | Tiles & Building Materials | Chicken Wire Mesh, 3ft, 2Kg |
| 94 | 960×1004 | Automotive & Tyres | RANGER A/T |
| 93 | 1200×1200 | Tiles & Building Materials | 3M Mirror Mount Tape, 5m |
| 21 | 213×84 | Tools & Hardware | Claw Hammer (Ash Wood Handle) |
| 20 | 217×45 | Tools & Hardware | Sliding Bar |

The 173×135 socket-set image scores 43 and no longer leads the default listing.

## Verification

| Check | Result |
|---|---|
| 233 scored, 0 download errors | pass |
| 233 unique product ids, descending scores | pass |
| B2C/B2B fallback order starts with the three approved labels | pass |
| BFF priority keeps the remaining order stable | pass |
| Global sort before pagination | pass |
| Unknown/equal scores keep source order | pass |
| Catalogue count stays 233, SKUs 500 | unchanged |
| `bun run typecheck` | pass |
| `bun run test:image-quality-order` | pass |
| `bun run test:presentation` | pass |
| `flutter analyze` | pass |
| `flutter test --exclude-tags golden` | 203 pass |

Tests: `image-quality-order-test.ts`, `presentation-test.ts`,
`session_route_policy_test.dart`, `cart_line_image_test.dart`,
`b2b_live_catalogue_test.dart`, `b2b_presentation_test.dart`,
`presentation_test.dart`.

## Limits

- The score is a CHG-049 staging fixture, not a production DAM assessment.
- B2B rail labels still come from CMS presentation; the code fallback is used
  only when presentation is unavailable.
- Both the Experience API and the app must be redeployed for the full effect.

Staging only; production release remains unauthorized.
