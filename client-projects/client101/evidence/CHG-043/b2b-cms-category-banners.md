# CHG-043 Phase 3 — B2B Reads CMS Category Banners

**Date:** 17 October 2026
**Change contract:** CHG-043
**Status:** Implemented and unit-verified; **not deployed and not visually verified**

## Why

The B2B app never asked the Experience API for the b2b channel, and its category banner came from a
hard-coded per-category Pexels map (`_categoryBanner` in `b2b_trade_providers.dart`). A B2B category
banner authored in the console could therefore never appear, however correctly it was published.

## What changed

| File | Change |
|---|---|
| `providers/catalog_providers.dart` | Added `b2bPresentationProvider`, requesting `channel: 'b2b'`, and `b2bCategoryBannerImageProvider`, which returns the CMS banner image for a category or `null` |
| `providers/b2b_trade_providers.dart` | Deleted the hard-coded `_categoryBanner` map and `b2bCategoryBannerImage` |
| `screens/b2b_home_screen.dart` | "Browse categories" banner now reads the CMS image, falling back to the shared governed placeholder |
| `screens/b2b_browse_screens.dart` | Catalogue banner does the same |
| `test/b2b_presentation_test.dart` | New: asserts the b2b channel is actually requested, that a CMS banner is used, and that a category with no authored banner yields `null` |

Returning `null` rather than inventing an image is deliberate: the caller renders the same shared
placeholder the B2C path uses, so "authored" and "not authored" stay distinguishable.

## Verification

- `flutter analyze`: **no issues**.
- `flutter test`: **135 tests pass**, including the three new cases.

The new tests assert the *requested channel*, which is the specific regression that existed. The
pre-existing B2B golden tests also pass, but they are **not** meaningful evidence here: widget tests do
not fetch network images, so the rendered banner is identical before and after.

## Verification limits — important

1. **Not deployed.** The Flutter app is published to Firebase Hosting
   (`buildkart-staging.web.app`), not to the VPS, and the deploy needs Firebase credentials that are not
   available here. Nothing in this change is reachable at any staging URL.
2. **No visual confirmation.** Nobody has seen a B2B category banner render from CMS content.
3. **It cannot show anything yet anyway.** No B2B category banner exists in the CMS — the migration
   created B2C records only — so the B2B screens will fall back to the placeholder until an operator
   authors one. That is correct behaviour, but it means a visual check needs a B2B banner to be created
   first.
4. **The B2B type still reads `Not rendered by the app`** in the console. That label is now out of date
   for a deployed app, but accurate for what is currently deployed, so it should only be relaxed once
   the app is actually published.
5. **The B2B home still has no hero** — there is no B2B home type in the registry, so nothing changed
   there.
6. **The `banner_image_alt` gap is untouched.** `MerchandisingBannerData` still has no alt-text field, so
   the strip and category banners drop the CMS alternative text. This is a live accessibility issue on
   the B2C surface and is not addressed by this change.
