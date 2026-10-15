# CHG-040 Hosted Staging Deployment

**Date:** 15 October 2026
**Change contract:** CHG-040 revision 2
**Environment:** Staging
**Status:** Deployed for human visual review; `production_release_authorized: false`

## Release

- Branch: `feat/medusa-native-merchandising-admin`
- Release commit: `f57ba86`
- Active worktree: `/opt/buildkart-releases/f57ba86`
- Previous release retained for rollback: `/opt/buildkart-releases/e8c9240`
- Active symlink: `/opt/buildkart-releases/current`

The combined hosted and FCM Compose configuration was validated before deployment. The FCM overlay
remains enabled. The Medusa image was rebuilt and only `medusa-api`, which serves the Mercur Admin
bundle, was recreated. The Experience API, CMS, workers, proxy and data services remained running.

## Hosted verification

- `medusa-api` and `experience-api` are healthy with zero restarts.
- Merchandising, Overview and all six property-page routes return HTTP `200`.
- Review queue, Delivery status and Content activity return HTTP `200`.
- The legacy `/dashboard/content` and route-based draft editor return HTTP `200`.
- Served admin bundle: `assets/index-CfNXiSx6.js`.
- Bundle contains Banners, Storefront layouts, Category presentation, Product editorial, Collection
  presentation, Help and articles, Needs review and Draft only.
- Bundle does not contain `New content type`, the generic `Create draft`, `Editorial content`,
  `Preset review`, `Review presets` or `Compare presets`.
- The operator content endpoint returns HTTP `401` without authentication.
- The customer host hides the same privileged endpoint with HTTP `404`.

## Human review checklist

Open `https://ops-staging.pinakaplay.cloud/dashboard/merchandising/banners` with an authorized
staging operator:

1. Confirm Banners, Storefront layouts, Category presentation, Product editorial, Collection
   presentation and Help and articles appear directly under Merchandising in the left sidebar.
2. Visit each property and confirm its primary action reads `New <property>` rather than
   `Create draft` or using a separate type selector.
3. Confirm All, Needs review, Draft only and Published tabs keep their state in the URL.
4. Test search, locale switching and pagination without creating or publishing customer-visible data.
5. Open an existing item and confirm Back returns to the corresponding property page.
6. Confirm Publish and Unpublish appear only as explicit row-menu actions with confirmation.
7. Open `/dashboard/content` and confirm it redirects to Banners.
8. Review at wide desktop and approximately 1024px; horizontal tabs and row actions must remain
   reachable without page-level clipping.
9. Open Collection presentation and confirm commerce product membership is not editable.

No production deployment or authorization was performed.
