# CHG-037 Hosted Staging Deployment

**Date:** 15 October 2026
**Change contract:** CHG-037 revision 2
**Environment:** Staging
**Status:** Deployed for human visual review; `production_release_authorized: false`

## Release

- Branch: `feat/medusa-native-merchandising-admin`
- Release commit: `9c07a35`
- Active worktree: `/opt/buildkart-releases/9c07a35`
- Previous release retained for rollback: `/opt/buildkart-releases/b317a08`
- Active symlink: `/opt/buildkart-releases/current`

The combined hosted and FCM Compose configuration was validated before deployment. The FCM overlay
remains enabled. The Medusa image was rebuilt and only `medusa-api`, which serves the Mercur Admin
bundle, was recreated. The Experience API, CMS, workers, proxy and data services remained running.

## Verification

- `medusa-api` and `experience-api` are healthy with zero restarts.
- `/dashboard/merchandising` returns HTTP `200`.
- `/dashboard/content` returns HTTP `200`.
- The legacy `/dashboard/merchandising-presets` route returns the Admin shell and its client route
  redirects to `/dashboard/merchandising`.
- Served admin bundle: `assets/index-C1Hsv4_m.js`.
- Bundle contains `Commerce collections`, `Manage categories` and `Draft editorial items`.
- Bundle does not contain `Preset review`, `Review presets`, `Promotions configured` or
  `missing live promotions`.
- The internal operator reconciliation endpoint returns HTTP `401` without authentication.
- The customer host hides the same endpoint with HTTP `404`.

## Human review

Open `https://ops-staging.pinakaplay.cloud/dashboard/merchandising` and confirm:

1. **Preset Review** is absent from the sidebar and overview.
2. Promotions, Campaigns, Commerce collections, Categories and Editorial content open their
   respective authoritative controls.
3. The overview shows only real editorial state and CMS connectivity.
4. Opening the old Preset Review URL returns the operator to Merchandising.

No production deployment or authorization was performed.
