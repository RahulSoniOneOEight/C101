# CHG-064 — always-visible sort and filter controls

**Date:** 2026-10-20
**Status:** Deployed to staging; human review pending
**Build:** `5a9e291`
**Change:** `client-projects/client101/changes/CHG-064.yaml`

## What changed

Replaced the Browse sort dropdown and Filter button with a pinned control block on the listing
screen. Hero, category row, product cards and search are untouched.

### Sort

- Chip row: **Relevance**, **Price ↑**, **Price ↓**, **Rating**. Default Relevance.
- Selected: filled with the SORT accent, white text, check icon.
- Unselected: white surface, neutral border.
- One tap applies; the existing sort enum and list ordering are unchanged.

### Filter

- Fixed **Filters** button with sliders icon and an active-count badge; opens the full sheet.
- Inline multi-select quick chips: **Flash Deal**, **Clearance**, **In stock**; one tap applies.
- Selected chips use the FILTER accent, white text and a check icon.
- The sheet now contains Brand, Price, **Rating (4★ & up)**, and Key items. Key-item chips use the
  same filter accent.
- Footer: **Reset** and **Show N results** with a live count.
- **Clear all** appears next to the result count only while a filter is active and resets filters,
  not sort.

### Sticky

The two rows plus the result count live in a pinned `SliverPersistentHeader`, so they stay under the
app bar while the grid scrolls.

## Tokens

Defined once in `apps/prototype_app/lib/theme/storefront_control_tokens.dart`.

| Role | Token | Value | White contrast |
|---|---|---|---|
| SORT | `AgencyColors.feedbackSuccess` | `#3D7A57` | 5.1:1 |
| FILTER | `AgencyColors.actionDestructive` | `#B54747` | 5.3:1 |

`trust` (`#0D9488`) and `promotion` (`#FF6B35`) were rejected because white text fails 4.5:1 on them.
No hex values were added to UI code; swapping an accent is one line in the token file.

Selection is not colour-only: every selected chip also shows a check icon and carries the semantics
`selected` flag (verified in tests).

## Behaviour fixes found during verification

- **Flash Deal matched no products.** The filter only recognised the badge wording "limited deal";
  imported products use "Flash Deal". It now accepts both and returns 16 results on staging.
- **Filter sheet chips used the default blue.** They now use the same FILTER accent as the quick
  chips.

## Verification

| Check | Result |
|---|---|
| `flutter analyze` | clean |
| `flutter test --exclude-tags golden` | 219 pass |
| Default sort selected / semantics | pass |
| Sort reorders on tap | pass |
| Quick chip applies instantly; count updates | pass |
| Clear all visible only when filtered; resets filters only | pass |
| Sheet live count and Reset | pass |
| Sticky header pinned | pass (widget + live) |
| 390×844 live render | sort green, filter red, 16 results, sheet 16 results |
| Horizontal overflow | none |
| Console errors | none |

Live checks used headless Chromium at 390×844 with the Flutter accessibility tree enabled.

## Notes

- The listing had no pre-existing inline Flash Deal / Clearance chip row to move; the full set lived
  only in the filter sheet. The quick row is the single inline control, and the sheet remains the
  full set, so there are no duplicate rows.
- Flutter exposes the selected state through its semantics API rather than an `aria-pressed` DOM
  attribute. The tests assert the semantics flag; adding `toggled` to force an ARIA attribute
  removed the chips from the accessibility tree, so it was not used.
- `In stock` (new) and `Rating 4★ & up` are additive filters; existing brand, price and key-item
  logic is unchanged.

Staging only; production remains unauthorized.
