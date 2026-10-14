# CHG-038 Hosted Staging Deployment

**Date:** 15 October 2026
**Change contract:** CHG-038 revision 2
**Environment:** Staging
**Status:** Deployed for human visual review; `production_release_authorized: false`

## Release

- Branch: `feat/medusa-native-merchandising-admin`
- Release commit: `fc5178d`
- Active worktree: `/opt/buildkart-releases/fc5178d`
- Previous release retained for rollback: `/opt/buildkart-releases/9c07a35`
- Active symlink: `/opt/buildkart-releases/current`

The combined hosted and FCM Compose configuration was validated before deployment. The FCM overlay
remains enabled. The Medusa image was rebuilt and only `medusa-api`, which serves the Mercur Admin
bundle, was recreated. The Experience API, CMS, workers, proxy and data services remained running.

## Hosted verification

- `medusa-api` and `experience-api` are healthy with zero restarts.
- `/dashboard/merchandising` returns HTTP `200`.
- `/dashboard/content` returns HTTP `200`.
- `/dashboard/content/banner/new?locale=en-IN` returns HTTP `200`.
- Served admin bundle: `assets/index-8XDyg65F.js`.
- Bundle contains `Collection presentation`, `New content type`, `Draft context` and the explicit
  draft-only save message.
- Bundle does not contain `Preset review`, `Review presets` or `Promotions configured`.
- The operator content endpoint returns HTTP `401` without authentication.
- The customer host hides the same privileged endpoint with HTTP `404`.

## Human review checklist

Open `https://ops-staging.pinakaplay.cloud/dashboard/content` with an authorized staging operator:

1. Confirm the unified library is clear at wide desktop and 1024px.
2. Switch content type, locale and publication status; search for an item and confirm the URL keeps
   the selected context.
3. Confirm the right-side row action remains reachable when the table scrolls horizontally.
4. Open an existing item and confirm it uses a full-page editor rather than a drawer.
5. Make a harmless draft-only change, test Ctrl/Command+S and confirm no publication occurs.
6. Make another harmless change, navigate back and confirm the unsaved-change warning appears.
7. Open Collection presentation and confirm commerce product membership is not editable.
8. Create and save a bounded test draft, without selecting **Publish** from the library.

Also review `https://ops-staging.pinakaplay.cloud/dashboard/merchandising` for action hierarchy,
responsive cards and authoritative commerce links.

No production deployment or authorization was performed.
