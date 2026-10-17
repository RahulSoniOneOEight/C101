# CHG-035 Hosted Staging Deployment Acceptance

**Date:** 13 October 2026  
**Scope:** Bounded hosted staging on `srv2040286` (`89.116.20.164`)  
**Change Contract:** CHG-035 revision 2  
**Status:** Deployed to staging for human review; `production_release_authorized: false`

## Release

- Branch `feat/medusa-native-merchandising-admin`, release commit `274174e`.
- Release worktree `/opt/buildkart-releases/274174e`; `/opt/buildkart-releases/current` now points there.
- The operator's pre-existing checkout under `/opt/buildkart` was not modified.
- `FCM_DELIVERY_ENABLED=true`, so every operation that can recreate `experience-api`, workers, proxy
  or dependencies used `docker-compose.hosted.yml -f docker-compose.fcm.yml`. No 503 recurred.
- CMS and Experience API images were rebuilt and recreated; the Medusa API image (which bundles both
  dashboards) was rebuilt and recreated. PostgreSQL, Redis, NATS, Tryton, workers and proxy were left
  running.

## Common-console result

- `/dashboard/`, `/dashboard/content` and `/dashboard/merchandising` all return `200`.
- The served admin bundle contains the new `Merchandising`, `Editorial content` and `Preset review`
  surfaces plus native-editor deep links.
- `/admin/buildkart/content`, `/admin/buildkart/merchandising-presets` and
  `/admin/buildkart/merchandising-offers` all exist and return `401` unauthenticated.
- The customer host returns `404` for the same admin routes.

## Backend-managed storefront presentation

- `GET /v1/content/presentation?locale=en-IN&channel=b2c` returns `200` with six root categories and
  five banners, all `presentation_source: cms` / `source: cms-strapi`, `stale: false`.
- Root categories resolve to the intended app labels, icons and banner imagery, for example
  `Construction | construction | cms`, `Electrical | electrical | cms`,
  `Pumps & Machines | pumps-machines | cms`.
- Deliveries are same-origin through the Experience API; CORS preflight from the web origin returns
  `204` with `access-control-allow-origin: *`.
- The CMS bootstrap published the governed presentation seed (`[cms-seed] storefront presentation
  seed ensured`). Existing operator records were not overwritten.

## Post-deploy refinement (commit `49b9d53`)

- The campaign strip (`home.campaign-strip`, "Clearance Sale") is now driven by the backend banner
  instead of hardcoded Flutter values: image, title, subtitle, action label and action target.
  Verified in the served `main.dart.js` (`home.campaign-strip`, `/v1/content/presentation`).
- The strip follows the backend `action_uri` when present, falling back to the previous local tag
  behaviour when it is absent.
- Still outstanding: the hero carousel renders title, subtitle and colour but not the banner image,
  so a hero `externalImageUrl` change is not yet visible in the app.

## Web app

- The Flutter web app was rebuilt with staging defines and deployed to Firebase Hosting
  (`buildkart-staging.web.app`); the site returns `200`.
- The app now renders hero banners, category labels/icons and category imagery from the backend
  instead of hardcoded Flutter constants, with the governed fallback when the API is unavailable.

## Verification

- `GET /health`: `status=ok`, `environment=staging`, `cms_adapter=configured`, NATS and identity
  store connected.
- `GET /v1/content/app-shell?locale=en-IN&channel=b2c` remains healthy after the deploy.
- Local: Experience API `typecheck` and `test:presentation` pass; Strapi build passes; Flutter
  `analyze lib` clean and 131 tests pass.

## Follow-up for human review

- The pre-existing CMS banner `banner-welcome-en-in` (`home.hero`, priority `100`) now leads the hero
  carousel ahead of the seeded app banners. Decide whether to keep, reorder or unpublish it; the
  carousel order is fully editorial.
- The pre-existing category editorial `pcat_construction` ("Construction essentials") is keyed to a
  category id that does not match the deployed generated category ids, so it is currently inert.
  Re-point it at the live commerce category id or remove it.
- A duplicate seed record created during the first deploy (`categoryId: "Construction"`) was removed
  from `buildkart_cms.category_editorials`; no component or relation rows were attached to it.
- Media upload remains deferred; banner imagery is referenced by validated HTTPS URL.
- `production_release_authorized` remains `false`.
