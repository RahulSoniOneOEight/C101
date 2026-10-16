# CHG-042 Banner Studio — Hosted Staging Deployment

**Date:** 16 October 2026
**Change contract:** CHG-042 revision 2
**Environment:** Staging
**Status:** Deployed for human review; `production_release_authorized: false`

## Release

- Branch: `feat/medusa-native-merchandising-admin`
- Release commit: `13941b2`
- Active worktree: `/opt/buildkart-releases/13941b2`
- Previous release retained for rollback: `/opt/buildkart-releases/e4a1f32`
- Active symlink: `/opt/buildkart-releases/current`

The combined hosted and FCM Compose configuration validated before deployment. The CMS, Medusa API and
Experience API images were rebuilt and only those three services were recreated; PostgreSQL, Redis,
NATS, Tryton, workers and the proxy were left running. The proxy was reloaded so its upstreams resolve
the recreated containers.

## New private secret

The draft preview projection needed its own credential. A dedicated `EXPERIENCE_OPERATOR_SECRET` was
generated on the host and written to both `/etc/buildkart/secrets/medusa.env` and
`/etc/buildkart/secrets/experience-api.env` (same value, fingerprint verified as identical, files still
`600 root:root`). It is deliberately not the CMS operator secret or the CMS webhook secret, so no
secret is reused across trust boundaries. The value is never printed, committed, or returned to a
browser.

## Verified behaviour

Served admin bundle: `assets/index-yZk987kb.js`.

- Banner studio routes return HTTP `200`, including the new `Scheduled` tab (`?view=scheduled`).
- The served bundle contains `Banner studio`, `Create banner`, `Scheduled`, `Internal name`,
  `Duplicate`, `Review & publish`, `Live preview` and `Illustrative preview`.
- The served bundle does **not** contain `Media library`, `Campaign landing page`, or the demo's
  fabricated catalogue (`Bulk essentials`, `Festive favourites`).
- The operator content endpoint returns `401` without authentication.
- The customer host returns `404` for `/v1/internal/content/preview`, so the preview route stays
  private; nginx blocks `/v1/internal` at both public hostnames.
- `GET /v1/content/presentation` is unchanged: `source=cms-strapi+category:cms-strapi`, `stale=false`,
  the same five banner keys and six categories.

### Preview projection

Called server-to-server inside the private network with the new secret:

- authorised request → `200`, `illustrative: true`, mapped `presentation` with `title`, `action_uri`
  `/browse?tag=Flash%20Deals`, and `eligibility: scheduled` for a banner starting tomorrow;
- identical request with a wrong bearer token → `401`.

### Draft isolation, duplicate and concurrency

Exercised against the private CMS operator API through the compiled runtime:

- `duplicate-draft` → `201`, created `secondary-clearance-sale-copy`, name `secondary-clearance-sale
  (copy)`, `publishedAt: null`. The source banner's publication state was untouched.
- stale save (`expectedUpdatedAt` from the year 2000) → `409` with `CmsEditConflictError`, and the
  write was not applied.
- save with the correct token → `200` and the field updated.
- audit rows recorded: `chg-042-dup duplicate-draft succeeded`, `chg-042-conflict update-draft failed`,
  `chg-042-ok update-draft succeeded`.
- the duplicate was test data and was deleted afterwards; the banner table is back to its original
  ten rows and no `-copy` keys remain.

### Schema

`banners.name` (nullable string) exists after the CMS migration, so the operator-facing internal name
is stored without affecting delivery. Only the five already-published banners remain fixed; nothing was
published by this deployment.

### Service health

`cms`, `medusa-api` and `experience-api` are healthy with zero restarts.

## Human review checklist

Open `https://ops-staging.pinakaplay.cloud/dashboard/merchandising/banners` with an authorised staging
operator:

1. Confirm the header, Staging badge, counts and `Create banner` action.
2. Confirm the All, Needs review, Draft only, Published and Scheduled tabs keep state in the URL.
3. Test search plus the placement, audience and language filters.
4. Confirm the table separates editorial status from display eligibility, and that no banner claims to
   be displaying.
5. Open a banner: confirm the grouped sections, the language switch, the conditional destination field
   and the schedule controls.
6. Confirm the preview pane updates while typing and that the App, Mobile web and Desktop modes and the
   illustrative note behave sensibly.
7. Save a draft and confirm the published banner is unchanged.
8. Use `Duplicate` and confirm the copy is a draft.
9. Publish or schedule from the review dialog and confirm the summary matches what you entered.
10. Open two tabs on the same banner, save in both, and confirm the second save is stopped with the
    reload message instead of overwriting.
11. Review at wide desktop and approximately 1024px.

No production deployment or authorization was performed.

## Known limitations and deviations (deliberate)

Recorded so nothing is mistaken for finished work:

1. **Media upload, crop and focal point are not implemented.** The creative is an https reference and
   crop is fixed by the customer app. DAM authority is still unresolved under CHG-026.
2. **Per-banner channel does not exist.** The field is shown read-only with an explanation; channel and
   ordering come from the storefront layout.
3. **Commerce entity pickers are not implemented.** Destinations are entered directly and validated for
   shape only. `Campaign landing page` is not an approved target type, so it is not offered.
4. **The preview is an approximation.** It is generated from the real delivery mapping rules but the
   storefront is Flutter, so typography, crop and theme treatment are not pixel-accurate. App/Mobile
   web/Desktop change the frame only.
5. **Placement conflicts are not yet validated** beyond what the operator can see; a rules engine is
   deferred.
6. **Publish/unpublish still use the existing placeholder permission resource (`promotion`).** Real
   content roles are a separate governed item and remain unimplemented.
7. **Scheduling is publish plus a server-enforced window.** Strapi scheduled publishing is not enabled
   and was not simulated.
8. **Disabled/unassigned eligibility states are not shown**, because determining layout membership
   reliably is not available yet. The four honest states are not-published, expired, scheduled and
   eligible.
9. **Language handling** creates a localised draft when one does not exist, and the preview follows the
   language being edited.
