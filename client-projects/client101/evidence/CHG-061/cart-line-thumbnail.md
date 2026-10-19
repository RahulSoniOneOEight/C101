# CHG-061 — cart line thumbnail

**Date:** 2026-10-19
**Status:** Implemented and unit-verified; staging deployment pending
**Change:** `client-projects/client101/changes/CHG-061.yaml`

## Defect

The cart rendered a generic image placeholder for every line, although the same
product showed a correct thumbnail on Home, Browse and the product page. The
composed cart view exposed no image, and `CartLineItem` had no field for one.

## Fix

Backend (`services/experience-api/src/medusa/store-client.ts`): the cart line
contract gains optional `product_id`, `variant_id` and `thumbnail`. The composed
cart view already spreads each line, so these pass through untouched. No money
field is touched.

App (`apps/prototype_app/lib/domain/models.dart`):

- `CartLineItem` parses and persists `product_id`, `variant_id`,
  `product_title` and `thumbnail`.
- `catalogueProductForCartLine` matches by product id → variant id → exact
  title.
- `cartLineImageUrl` returns the line thumbnail first, else the matched
  catalogue thumbnail, else `null` so the existing placeholder stays.

`cart_screen.dart` passes the result to `PinCartLine.imageUrl`.

## Verification

| Check | Result |
|---|---|
| Canonical line thumbnail wins | pass |
| Product id resolves catalogue image | pass |
| Variant id resolves catalogue image | pass |
| Legacy title fallback resolves | pass |
| No match returns null (placeholder) | covered by resolver contract |
| `flutter analyze` | pass |
| `flutter test --exclude-tags golden` | 209 pass |

Tests: `apps/prototype_app/test/cart_line_image_test.dart`.

## Deployment

App build `711e5e3` is deployed. The cart resolves the image by line thumbnail,
product id, variant id, then exact product title, so the deployed app already
recovers the catalogue thumbnail from the existing `product_title` field.

The **Experience API container is still the previous release**, so the
`thumbnail`, `product_id` and `variant_id` fields are not yet returned. The
title fallback covers that gap; the direct id path activates with the API
release. Blocked on deploy-host access.

Staging only; production release remains unauthorized.
