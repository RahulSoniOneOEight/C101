# CHG-036 Hosted Staging Deployment

**Date:** 14 October 2026
**Change contract:** CHG-036 revision 4
**Environment:** Staging
**Status:** Deployed for human visual review; `production_release_authorized: false`

## Release

- Branch: `feat/medusa-native-merchandising-admin`
- Release commit: `b317a08`
- Active worktree: `/opt/buildkart-releases/b317a08`
- Previous release retained for rollback: `/opt/buildkart-releases/274174e`
- Active symlink: `/opt/buildkart-releases/current`
- The operator's pre-existing checkout at `/opt/buildkart` was not modified.

The combined `docker-compose.hosted.yml` and `docker-compose.fcm.yml` configuration was validated
before deployment. `FCM_DELIVERY_ENABLED=true`; the FCM overlay and Firebase secret mount remain in
place. The Medusa image, which bundles the Mercur Admin console, was rebuilt and only `medusa-api`
was recreated. CMS, Experience API, workers, proxy, PostgreSQL, Redis, NATS and Tryton remained
running.

## Review URLs

- Merchandising overview: `https://ops-staging.pinakaplay.cloud/dashboard/merchandising`
- Editorial content: `https://ops-staging.pinakaplay.cloud/dashboard/content`

Use an authorized staging operator account. Draft creation and edits are safe for review when the
reviewer does not invoke the separate publish action.

## Verification

- `medusa-api` is healthy with zero restarts after recreation.
- `experience-api` remained healthy with zero restarts.
- Both review routes return HTTP `200`.
- The served `assets/index-ALk5Utcb.js` bundle contains the new labels:
  - `Needs editorial review`
  - `Search this content type`
  - `Discard unsaved draft changes?`
  - `Consumer pending`
  - `One authoritative editor`
- Unauthenticated access to the operator content endpoint returns HTTP `401`.
- The same privileged endpoint on the customer host remains hidden with HTTP `404`.
- The public Experience API health endpoint reports staging, connected NATS, configured CMS adapter
  and simulated payment mode.
- The public presentation projection continues to return localized storefront content.

## Human review still required

1. Confirm dashboard hierarchy, counts and CMS connection state after login.
2. Review content-type navigation, search, status filtering, locale switching and pagination.
3. Open a row action menu and create or edit a draft without publishing it.
4. Change a draft field and close the drawer to verify the discard warning.
5. Review desktop and narrow-width layouts and keyboard focus behavior.
6. Confirm each editable property resolves to one authoritative control.

No production deployment or release authorization was performed.
