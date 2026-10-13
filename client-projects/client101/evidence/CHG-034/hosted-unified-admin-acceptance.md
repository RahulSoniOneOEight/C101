# Hosted Unified Admin Acceptance

**Date:** 13 October 2026  
**Scope:** Bounded hosted staging on `srv2040286`  
**Change Contract:** CHG-034 revision 2  
**Status:** Implemented in staging; awaiting human visual review; production release unauthorized

## Release

- Merged PR: #39.
- Hosted release commit: `2d8395d`.
- Active release worktree: `/opt/buildkart-releases/2d8395d`; the operator's pre-existing modified
  checkout was not overwritten.
- CMS, Medusa API, Experience API, PostgreSQL, Redis, NATS and dependent health-checked services
  were healthy after deployment.

## Common-console result

- `https://ops-staging.pinakaplay.cloud/dashboard/content` is bundled into the existing Mercur Admin
  application and uses its existing login session; there is no iframe or second Strapi login.
- The Content workspace logically groups all six governed content kinds: storefront layouts,
  banners, curated collections, category editorial, product editorial, and help/articles.
- The workspace exposes explicit **Save draft**, **Publish**, and **Unpublish** actions and displays
  `draft`, `modified`, or `published` status.
- Authenticated list requests succeeded for all six kinds. Current English staging counts were one
  layout, one banner, one collection, one category editorial, and no product/help records.
- Existing commerce administration and the seller portal remain in the same Mercur deployment.

## Draft and delivery acceptance

- A reversible test changed only the `b2c-home` schedule end time through the unified admin facade.
- Saving the change as a draft produced `publicationStatus=modified`; the public Experience API
  continued to return the original published schedule.
- Publishing made the reviewed schedule visible through the Experience API after signed webhook
  invalidation.
- Unpublishing removed the layout cleanly; stale or governed-seed layout content was not restored.
- The original schedule was then restored as a draft and republished. The public response again
  returned the original value with `freshness.stale=false`.

## Authentication, boundary and audit checks

- Unauthenticated access to `/admin/buildkart/content` returned `401`.
- The customer hostname returned `404` for the same admin route.
- Direct unauthenticated access to private `/api/operator-content/*` returned `401`, and the operator
  hostname exposes no matching Strapi route (`404`).
- The authenticated Medusa facade returned `200` and never returned an operator secret or Content
  API token.
- An invalid content kind returned `400`. A payload containing commerce-owned `price` returned `400`
  before mutation.
- Five successful audit rows were recorded for the reversible test: two draft updates, two publishes,
  and one unpublish. Every row carried actor ID, correlation ID, locale, document ID, action, payload
  SHA-256, status and timestamp.
- The dedicated `CMS_OPERATOR_SECRET` is shared only through root-owned `cms.env` and `medusa.env`,
  both mode `0600`. The deployed dashboard bundle does not contain the secret value.
- Strapi remains private on the application network plus `127.0.0.1:1337`; loopback health returned
  `204`. No public Strapi admin or Content API edge route was added.

## Verification

- Repository CI: both validation jobs and the Strapi build passed on PR #39.
- Local builds passed for Strapi, Mercur Admin and the Medusa API artifact; the production backend
  image bundled both dashboards at their configured paths.
- Three CMS operator client unit tests passed: server-only authorization headers, mutation envelope,
  and safe upstream error handling.
- Public `/health` returned `status=ok`, `cms_adapter=configured`, connected NATS and identity store.
- Public B2C layout source remained `cms-strapi`; bundle source remained
  `cms-strapi+governed-editorial-seed` with `freshness.stale=false` after restoration.

## Deployment note and residual review

- During cutover, a base-Compose proxy operation recreated the Experience API without the already
  approved FCM overlay, causing a brief staging `503`. The process stopped before advancing the
  release symlink, the service was immediately recreated with `docker-compose.fcm.yml`, and all
  health and content checks subsequently passed. The hosted runbook now explicitly requires the
  overlay for every later operation that can recreate Experience API, workers or proxy dependencies.
- Media upload and full Strapi plugin parity remain deferred; existing media references are
  preserved by draft updates.
- Cloudflare Access and final least-privilege operator-role hardening remain required before broader
  operator exposure.
- Human visual/content review is still required. `production_release_authorized` remains `false`.
