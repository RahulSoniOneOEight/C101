# CHG-047 — banner authoring fields removed

**Scope:** Console banner editor, private operator content API, banner delivery mapping. Segments untouched.

## What changed

| Surface | Before | After |
|---|---|---|
| Banner editor | Showed `Image alternative text` and `Colour theme` | Neither field is shown |
| Publish rule | Blocked without alt text | Heading is the only required copy |
| Operator API | Accepted `imageAltText`, `themeKey` | Neither is accepted |
| Banner delivery | Required alt text, emitted `image_alt` and `theme_key` | Emits neither; a banner without alt is no longer dropped |
| CMS schema | `imageAltText` required | Optional |
| Segments | Stored, not enforced | Unchanged |

## Why the delivery guard had to change

`mapBannerFields` previously returned `undefined` when `imageAltText` was empty, so removing the authoring
field alone would have made every newly created banner invisible. The guard now requires key, placement
and title only.

## What was deliberately not done

The CMS attributes `imageAltText` and `themeKey` still exist as columns with their existing data. Dropping
them is an irreversible schema change with no functional benefit, so they are dormant: not authored, not
accepted by the operator API, not delivered.

## Consequences to review

- Banner artwork now has **no accessible label**. That is valid only while the heading carries the
  meaning; an offer that lives solely inside the image would be unreadable to a screen reader.
- `theme_key` no longer reaches the app, which already defaults to `primary`. The card design does not
  use it, so nothing visible changes.

## Verification

- Experience API typecheck clean; `presentation-test` PASS, now asserting that a banner without alt
  ships and that `image_alt` / `theme_key` are absent from the payload.
- CMS schema validation passed (6 content types, 9 components).
- Admin `tsc -b` clean.
- Staging console rebuilt and verified after release.
