# CHG-039 Hosted Staging Deployment

**Date:** 15 October 2026
**Change contract:** CHG-039 revision 2
**Environment:** Staging
**Status:** Deployed for human visual review; `production_release_authorized: false`

## Release

- Branch: `feat/medusa-native-merchandising-admin`
- Release commit: `e8c9240`
- Active worktree: `/opt/buildkart-releases/e8c9240`
- Previous release retained for rollback: `/opt/buildkart-releases/fc5178d`
- Active symlink: `/opt/buildkart-releases/current`

The combined hosted and FCM Compose configuration was validated before deployment. The FCM overlay
remains enabled. The Medusa image was rebuilt and only `medusa-api`, which serves the Mercur Admin
bundle, was recreated. The Experience API, CMS, workers, proxy and data services remained running.

## Hosted verification

- `medusa-api` and `experience-api` are healthy with zero restarts.
- `/dashboard/merchandising` returns HTTP `200` (client-side redirect to the overview child).
- `/dashboard/merchandising/overview` returns HTTP `200`.
- `/dashboard/merchandising/review-queue` returns HTTP `200`.
- `/dashboard/merchandising/delivery-status` returns HTTP `200`.
- `/dashboard/merchandising/content-activity` returns HTTP `200`.
- `/dashboard/content` and `/dashboard/content/banner/new?locale=en-IN` return HTTP `200`.
- Served admin bundle: `assets/index-DraBj2cJ.js`.
- Bundle contains `Merchandising overview`, `Review queue`, `Delivery status`, `Content activity`,
  `Needs attention`, `Recently changed`, `Content-type coverage` and `Recently published`.
- Bundle does not contain `Preset review`, `Review presets`, `Promotions configured` or `Compare presets`.
- The operator content endpoint returns HTTP `401` without authentication.
- The customer host hides the same privileged endpoint with HTTP `404`.

## Human review checklist

Open `https://ops-staging.pinakaplay.cloud/dashboard/merchandising/overview` with an authorized
staging operator:

1. Confirm **Merchandising** is the primary left-sidebar group with Overview, Editorial content,
   Review queue, Delivery status and Content activity as children.
2. Confirm each page shows exactly one horizontal tab row and the selected tab persists in the URL.
3. On Overview, move between Needs attention, Scheduled and Recently changed and confirm the counts
   and rows come from real CMS records for the chosen locale.
4. On Review queue, confirm it lists real changes-not-published and draft-only records and links to
   the publication controls.
5. On Delivery status, confirm it reports only editor availability and declared coverage, and that
   it does not claim a storefront or webhook receipt.
6. On Content activity, confirm it is labelled as a timestamp snapshot and not as an audit trail.
7. Confirm at wide desktop and approximately 1024px that tabs scroll horizontally and row actions
   stay reachable.
8. Confirm **Editorial content** still opens the unified library and route-based draft editors, and
   that /dashboard/merchandising redirects to the overview.

No production deployment or authorization was performed.
